import { createClient } from '@supabase/supabase-js';
import { EXPECTED_SUPABASE_ORIGIN, getSupabaseClientConfig, logSupabaseEnvProof } from './supabaseEnv.js';
export const supabaseClientConfig = getSupabaseClientConfig();
export const isSupabaseClientEnabled = supabaseClientConfig.hasValidConfig;
export const supabaseConfigErrorMessage = supabaseClientConfig.frontendEnvError;
if (supabaseClientConfig.frontendEnvError) {
    console.error(supabaseClientConfig.frontendEnvError);
}
if (supabaseClientConfig.warningMessage) {
    console.warn(supabaseClientConfig.warningMessage);
}
logSupabaseEnvProof(supabaseClientConfig);
// Never allow malformed or mismatched frontend env to crash module import. When the
// selected config is invalid, create an inert SDK client against the expected public
// origin and guard auth/database calls before they run.
const safeClientUrl = supabaseClientConfig.hasValidConfig
    ? supabaseClientConfig.supabaseUrl
    : EXPECTED_SUPABASE_ORIGIN;
const safeClientKey = supabaseClientConfig.hasValidConfig
    ? supabaseClientConfig.supabaseKey
    : 'disabled-browser-supabase-client-config-invalid';
export const supabase = createClient(safeClientUrl, safeClientKey);
function isFetchFailure(error) {
    if (!error)
        return false;
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    return name === 'TypeError'
        || /failed to fetch/i.test(message)
        || /network/i.test(message)
        || /fetch/i.test(message)
        || /cors/i.test(message);
}
function authProbeUrl(config = getSupabaseClientConfig(), path = '/auth/v1/settings') {
    return new URL(path, config.supabaseUrl || EXPECTED_SUPABASE_ORIGIN);
}
async function fetchAuthProbe(target, apiKey) {
    try {
        const response = await fetch(target.toString(), {
            method: 'GET',
            headers: {
                apikey: apiKey,
                Authorization: `Bearer ${apiKey}`,
            },
        });
        return {
            urlOrigin: target.origin,
            urlPath: target.pathname,
            status: response.status,
            ok: response.ok,
            errorName: response.ok ? null : 'AuthProbeHttpError',
            errorMessage: response.ok ? null : `Auth probe returned HTTP ${response.status}`,
            isFetchFailure: false,
        };
    }
    catch (error) {
        return {
            urlOrigin: target.origin,
            urlPath: target.pathname,
            status: null,
            ok: false,
            errorName: error instanceof Error ? error.name : 'Error',
            errorMessage: error instanceof Error ? error.message : String(error),
            isFetchFailure: isFetchFailure(error),
        };
    }
}
export function getAuthConnectivityProbeTarget() {
    try {
        const target = authProbeUrl();
        return { urlOrigin: target.origin, urlPath: target.pathname };
    }
    catch {
        return { urlOrigin: null, urlPath: '/auth/v1/settings' };
    }
}
export async function probeSupabaseAuthConnectivity() {
    const config = getSupabaseClientConfig();
    let target;
    try {
        target = authProbeUrl(config);
    }
    catch (error) {
        return {
            urlOrigin: null,
            urlPath: '/auth/v1/settings',
            status: null,
            ok: false,
            errorName: error instanceof Error ? error.name : 'Error',
            errorMessage: error instanceof Error ? error.message : String(error),
            isFetchFailure: false,
        };
    }
    if (!config.hasValidConfig) {
        return {
            urlOrigin: target.origin,
            urlPath: target.pathname,
            status: null,
            ok: false,
            errorName: 'SupabaseConfigError',
            errorMessage: config.frontendEnvError ?? 'Supabase frontend config invalid',
            isFetchFailure: false,
        };
    }
    const settingsResult = await fetchAuthProbe(target, config.supabaseKey);
    if (settingsResult.status !== 404 && settingsResult.status !== 405) {
        return settingsResult;
    }
    // Older/newer GoTrue deployments may not expose /settings. In that case, fall
    // back to the safe health endpoint so the login page can distinguish auth
    // reachability from credential/user failures without exposing any secret.
    const healthTarget = authProbeUrl(config, '/auth/v1/health');
    return fetchAuthProbe(healthTarget, config.supabaseKey);
}
