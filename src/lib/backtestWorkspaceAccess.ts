import { isAdminPass } from './ownerPreview/state';

// Temporary while Supabase is paused. Set false when authenticated Admin access resumes.
export const TEMPORARY_OFFLINE_BACKTEST_WORKSPACE = true;

/** Local research only; never supplies a user ID, session or backend role. */
export function canUseOfflineBacktestWorkspace(userId: unknown): boolean {
    return TEMPORARY_OFFLINE_BACKTEST_WORKSPACE && !userId && isAdminPass();
}
