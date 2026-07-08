export const LOGIN_DEBUG_BUILD_MARKER = 'final-correct-cyyewawfc-env-reset-v1';
export const EXPECTED_SUPABASE_PROJECT_REF = 'uqiwbzfcntlcyyewawfc';
export const EXPECTED_SUPABASE_ORIGIN = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
export function getViteEnv(name) {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
        return import.meta.env[name] || null;
    }
    return null;
}
function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function getBrowserOrigin() {
    return typeof window === 'undefined' ? 'server-render-or-build' : window.location.origin;
}
function getBase64UrlJsonPayload(token) {
    const [, payload] = token.split('.');
    if (!payload)
        return null;
    try {
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const atobFn = globalThis.atob;
        if (typeof atobFn !== 'function')
            return null;
        const decoded = atobFn(padded);
        return JSON.parse(decoded);
    }
    catch {
        return null;
    }
}
function guessKeyType(key) {
    if (!key)
        return 'unknown';
    if (key.startsWith('sb_publishable_'))
        return 'publishable';
    if (key.startsWith('sb_secret_'))
        return 'forbidden_secret';
    const payload = getBase64UrlJsonPayload(key);
    if (payload?.role === 'anon')
        return 'jwt_anon';
    if (payload?.role === 'service_role')
        return 'forbidden_secret';
    return 'unknown';
}
function stringFromClaim(value) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number')
        return String(value);
    return null;
}
function projectRefFromIssuer(iss) {
    if (!iss)
        return null;
    try {
        const parsed = new URL(iss);
        return parsed.hostname.endsWith('.supabase.co')
            ? parsed.hostname.slice(0, -'.supabase.co'.length)
            : parsed.hostname.split('.')[0] || null;
    }
    catch {
        const match = iss.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
        return match?.[1] ?? null;
    }
}
function decodeKeyDebug(key, keyTypeGuess) {
    if (!key || keyTypeGuess !== 'jwt_anon') {
        return { role: null, ref: null, iss: null, exp: null, projectMatch: 'unknown' };
    }
    const payload = getBase64UrlJsonPayload(key);
    if (!payload)
        return { role: null, ref: null, iss: null, exp: null, projectMatch: 'unknown' };
    const role = stringFromClaim(payload.role);
    const ref = stringFromClaim(payload.ref) ?? stringFromClaim(payload.project_ref);
    const iss = stringFromClaim(payload.iss);
    const exp = stringFromClaim(payload.exp);
    const issuerRef = projectRefFromIssuer(iss);
    const comparableRef = ref ?? issuerRef;
    const projectMatch = comparableRef
        ? (comparableRef === EXPECTED_SUPABASE_PROJECT_REF ? 'true' : 'false')
        : 'unknown';
    return { role, ref, iss, exp, projectMatch };
}
function parseSupabaseUrl(url) {
    if (!url) {
        return {
            host: null,
            origin: null,
            projectRef: null,
            isExpectedProjectRef: false,
            parseError: null,
        };
    }
    try {
        const parsed = new URL(url);
        const projectRef = parsed.hostname.endsWith('.supabase.co')
            ? parsed.hostname.slice(0, -'.supabase.co'.length)
            : parsed.hostname.split('.')[0] || null;
        return {
            host: parsed.host,
            origin: parsed.origin,
            projectRef,
            isExpectedProjectRef: projectRef === EXPECTED_SUPABASE_PROJECT_REF,
            parseError: null,
        };
    }
    catch {
        return {
            host: null,
            origin: null,
            projectRef: null,
            isExpectedProjectRef: false,
            parseError: 'invalid Supabase URL',
        };
    }
}
function formatConfigError(reason) {
    return reason ? `Supabase frontend config invalid: ${reason}` : null;
}
function getWrongProjectWarning(source, projectRef) {
    return `${source} is present but points to wrong project ref ${projectRef ?? 'unknown'}; selected a higher-priority valid URL or safe fallback instead.`;
}
function selectBrowserKey() {
    const orderedKeys = [
        ['VITE_HASHIBOT_SUPABASE_ANON_KEY', nonEmpty(getViteEnv('VITE_HASHIBOT_SUPABASE_ANON_KEY'))],
        ['VITE_SUPABASE_ANON_KEY', nonEmpty(getViteEnv('VITE_SUPABASE_ANON_KEY'))],
        ['VITE_PUBLIC_SUPABASE_ANON_KEY', nonEmpty(getViteEnv('VITE_PUBLIC_SUPABASE_ANON_KEY'))],
        ['VITE_SUPABASE_PUBLISHABLE_KEY', nonEmpty(getViteEnv('VITE_SUPABASE_PUBLISHABLE_KEY'))],
        ['VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', nonEmpty(getViteEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))],
    ];
    for (const [source, key] of orderedKeys) {
        if (key)
            return { source, key };
    }
    return { source: 'missing', key: '' };
}
export function toSupabaseEnvProofLog(debug) {
    return {
        marker: debug.marker,
        rawHashibotUrlPresent: debug.hashibotSupabaseUrlPresent,
        rawPublicUrlPresent: debug.publicSupabaseUrlPresent,
        rawViteUrlPresent: debug.viteSupabaseUrlPresent,
        rawViteUrlProjectRef: debug.viteSupabaseUrlProjectRef,
        staleViteSupabaseUrlIgnored: debug.staleViteSupabaseUrlIgnored,
        selectedUrlSource: debug.selectedSupabaseUrlSource,
        selectedUrlOrigin: debug.selectedUrlOrigin,
        selectedUrlHost: debug.selectedUrlHost,
        selectedProjectRef: debug.selectedProjectRef,
        expectedProjectRef: debug.expectedProjectRef,
        projectRefMatch: debug.projectRefMatch,
        keySource: debug.selectedKeySource,
        keyPresent: debug.keyPresent,
        keyTypeGuess: debug.keyTypeGuess,
        decodedKeyRole: debug.decodedKey.role,
        decodedKeyRef: debug.decodedKey.ref,
        decodedKeyIss: debug.decodedKey.iss,
        keyProjectMatch: debug.keyProjectMatch,
    };
}
export function logSupabaseEnvProof(debug = getFrontendSupabaseDebugInfo()) {
    console.info('[HashiBot Supabase Env Proof]', toSupabaseEnvProofLog(debug));
}
export function getFrontendSupabaseConfig() {
    // Browser/Vite code intentionally reads only browser-safe VITE_* public values.
    // URL priority: VITE_HASHIBOT_SUPABASE_URL, VITE_PUBLIC_SUPABASE_URL, matching
    // VITE_SUPABASE_URL, then the known safe public fallback for the expected project.
    const hashibotSupabaseUrl = nonEmpty(getViteEnv('VITE_HASHIBOT_SUPABASE_URL'));
    const publicSupabaseUrl = nonEmpty(getViteEnv('VITE_PUBLIC_SUPABASE_URL'));
    const viteSupabaseUrl = nonEmpty(getViteEnv('VITE_SUPABASE_URL'));
    const hashibotParsed = parseSupabaseUrl(hashibotSupabaseUrl);
    const publicParsed = parseSupabaseUrl(publicSupabaseUrl);
    const viteParsed = parseSupabaseUrl(viteSupabaseUrl);
    const hashibotUrlAllowed = Boolean(hashibotSupabaseUrl && !hashibotParsed.parseError);
    const publicUrlAllowed = Boolean(publicSupabaseUrl && !publicParsed.parseError);
    const viteUrlAllowed = Boolean(viteSupabaseUrl && viteParsed.isExpectedProjectRef);
    const selectedUrlSource = hashibotUrlAllowed
        ? 'VITE_HASHIBOT_SUPABASE_URL'
        : publicUrlAllowed
            ? 'VITE_PUBLIC_SUPABASE_URL'
            : viteUrlAllowed
                ? 'VITE_SUPABASE_URL'
                : 'safe_public_fallback';
    const selectedUrl = hashibotUrlAllowed
        ? hashibotSupabaseUrl
        : publicUrlAllowed
            ? publicSupabaseUrl
            : viteUrlAllowed
                ? viteSupabaseUrl
                : EXPECTED_SUPABASE_ORIGIN;
    const selectedParsed = parseSupabaseUrl(selectedUrl);
    const { source: selectedKeySource, key: supabaseKey } = selectBrowserKey();
    const keyTypeGuess = guessKeyType(supabaseKey);
    const decodedKey = decodeKeyDebug(supabaseKey, keyTypeGuess);
    const keyProjectMatch = decodedKey.projectMatch;
    const keyProjectMismatchError = keyProjectMatch === 'false'
        ? 'Selected browser key appears to belong to a different Supabase project.'
        : null;
    const keyForbiddenError = keyTypeGuess === 'forbidden_secret'
        ? 'selected browser key appears to be a forbidden service-role/secret key'
        : null;
    const keyError = supabaseKey
        ? null
        : 'missing browser Supabase anon or publishable key';
    const selectedUrlError = selectedParsed.isExpectedProjectRef
        ? null
        : `selected Supabase URL project ref mismatch: expected ${EXPECTED_SUPABASE_PROJECT_REF}, got ${selectedParsed.projectRef ?? 'unknown'}`;
    // Key project mismatch is a WARNING only when the selected URL is correct.
    // The Supabase server validates the JWT — a key whose embedded ref claim points
    // to a different project will be rejected by the auth server, not silently accepted.
    // We do NOT block the client here; we surface the mismatch as a visible warning
    // so the operator knows to replace the stale key, while still allowing login attempts
    // against the correct URL (which will surface the real auth error if the key is wrong).
    const urlIsCorrect = selectedParsed.isExpectedProjectRef;
    const rawError = selectedParsed.parseError
        ?? selectedUrlError
        ?? keyForbiddenError
        ?? keyError
        // Only block on key project mismatch if the URL itself is also wrong — when
        // the URL is correct, the server will reject a mismatched key with a real error.
        ?? (!urlIsCorrect ? keyProjectMismatchError : null);
    const errorMessage = formatConfigError(rawError);
    const selectedProjectRef = selectedParsed.projectRef;
    const projectRefMatch = selectedProjectRef === EXPECTED_SUPABASE_PROJECT_REF;
    const isValid = errorMessage === null;
    const viteWrongProject = Boolean(viteSupabaseUrl && !viteParsed.isExpectedProjectRef && !viteParsed.parseError);
    const hashibotWrongProject = Boolean(hashibotSupabaseUrl && !hashibotParsed.isExpectedProjectRef && !hashibotParsed.parseError);
    const publicWrongProject = Boolean(publicSupabaseUrl && !publicParsed.isExpectedProjectRef && !publicParsed.parseError);
    const warningMessage = (urlIsCorrect && keyProjectMismatchError)
        ? `${keyProjectMismatchError} URL is correct (${EXPECTED_SUPABASE_PROJECT_REF}); login will fail if key belongs to wrong project. Replace VITE_SUPABASE_ANON_KEY with the anon key for ${EXPECTED_SUPABASE_PROJECT_REF}.`
        : keyProjectMismatchError
            ?? (viteWrongProject
                ? getWrongProjectWarning('VITE_SUPABASE_URL', viteParsed.projectRef)
                : hashibotWrongProject
                    ? getWrongProjectWarning('VITE_HASHIBOT_SUPABASE_URL', hashibotParsed.projectRef)
                    : publicWrongProject
                        ? getWrongProjectWarning('VITE_PUBLIC_SUPABASE_URL', publicParsed.projectRef)
                        : null);
    return {
        marker: LOGIN_DEBUG_BUILD_MARKER,
        isValid,
        errorMessage,
        warningMessage,
        selectedUrl,
        selectedUrlOrigin: selectedParsed.origin,
        selectedUrlHost: selectedParsed.host,
        selectedProjectRef,
        expectedProjectRef: EXPECTED_SUPABASE_PROJECT_REF,
        projectRefMatch,
        selectedKeySource,
        keyPresent: Boolean(supabaseKey),
        keyTypeGuess,
        decodedKey,
        keyProjectMatch,
        selectedSupabaseUrlSource: selectedUrlSource,
        hashibotSupabaseUrlPresent: Boolean(hashibotSupabaseUrl),
        hashibotSupabaseUrlHost: hashibotParsed.host,
        hashibotSupabaseUrlProjectRef: hashibotParsed.projectRef,
        publicSupabaseUrlPresent: Boolean(publicSupabaseUrl),
        publicSupabaseUrlHost: publicParsed.host,
        publicSupabaseUrlProjectRef: publicParsed.projectRef,
        viteSupabaseUrlPresent: Boolean(viteSupabaseUrl),
        viteSupabaseUrlHost: viteParsed.host,
        viteSupabaseUrlProjectRef: viteParsed.projectRef,
        staleViteSupabaseUrlIgnored: viteWrongProject,
        fallbackSupabaseUrlUsed: selectedUrlSource === 'safe_public_fallback',
        rawHashibotSupabaseAnonKeyPresent: Boolean(nonEmpty(getViteEnv('VITE_HASHIBOT_SUPABASE_ANON_KEY'))),
        rawSupabaseAnonKeyPresent: Boolean(nonEmpty(getViteEnv('VITE_SUPABASE_ANON_KEY'))),
        rawPublicSupabaseAnonKeyPresent: Boolean(nonEmpty(getViteEnv('VITE_PUBLIC_SUPABASE_ANON_KEY'))),
        rawSupabasePublishableKeyPresent: Boolean(nonEmpty(getViteEnv('VITE_SUPABASE_PUBLISHABLE_KEY'))),
        rawPublicSupabasePublishableKeyPresent: Boolean(nonEmpty(getViteEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY'))),
        browserOrigin: getBrowserOrigin(),
        selectedFrontendEnvSource: selectedUrlSource,
        selectedFrontendKeySource: selectedKeySource,
        selectedSupabaseUrlHost: selectedParsed.host,
        selectedSupabaseUrlOrigin: selectedParsed.origin,
        frontendSupabaseUrlHost: selectedParsed.host,
        managedSupabaseFallbackIgnored: true,
        expectedSupabaseOrigin: EXPECTED_SUPABASE_ORIGIN,
        actualProjectRef: selectedProjectRef,
        projectRefMatches: projectRefMatch,
        frontendEnvError: errorMessage,
        supabaseUrl: selectedParsed.origin ?? EXPECTED_SUPABASE_ORIGIN,
        supabaseKey,
        hasValidConfig: isValid,
    };
}
export function getFrontendSupabaseDebugInfo() {
    const config = getFrontendSupabaseConfig();
    return { ...config };
}
export function getFrontendSupabaseUrl() {
    const config = getFrontendSupabaseConfig();
    return config.supabaseUrl;
}
export function getSupabaseClientConfig() {
    return getFrontendSupabaseConfig();
}
