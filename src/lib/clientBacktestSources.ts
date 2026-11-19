import type { SupabaseClient } from '@supabase/supabase-js';
import { assertLabAdmin, normalizeLedger, type LedgerTrade } from './clientBacktestEngine';
import { COST_POSITIVE_CONFIG_IDS } from '../../supabase/functions/_shared/cost-positive-configs';
/** Existing validation_outcomes RLS permits Admin reads only. No service key or browser writes. */
export async function loadOnlineLedger(db: Pick<SupabaseClient, 'from'>, userId: string, role: unknown): Promise<{
    trades: LedgerTrade[];
    runId: string;
}> {
    assertLabAdmin(role);
    if (!userId)
        throw Error('ADMIN_REQUIRED');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    try {
        const profile = await db.from('profiles').select('id,role').eq('id', userId).abortSignal(controller.signal).maybeSingle();
        if (profile.error)
            throw Error('Online profile unavailable');
        if (profile.data?.id !== userId || profile.data?.role !== 'admin')
            throw Error('ADMIN_REQUIRED');
        const run = await db.from('validation_runs').select('id,outcome_assumptions').eq('status', 'COMPLETED').order('created_at', { ascending: false }).order('id').limit(1).abortSignal(controller.signal).maybeSingle();
        if (run.error || !run.data)
            throw Error('No completed online validation run');
        const completedRun = run.data;
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; offset < 20000; offset += 500) {
            const result = await db.from('validation_outcomes').select('id,candidate_id,strategy_id,symbol,timeframe,status,entry_time,exit_time,entry_price,exit_price,net_r,cost_r').eq('run_id', completedRun.id).in('status', ['TARGET', 'STOP', 'REGIME_EXIT', 'TIMEOUT']).in('strategy_id', [...COST_POSITIVE_CONFIG_IDS]).order('id').range(offset, offset + 499).abortSignal(controller.signal);
            if (result.error || !Array.isArray(result.data))
                throw Error('Online outcomes unavailable');
            rows.push(...result.data.filter((r: Record<string, unknown>) => r.status !== 'TIMEOUT' || /^((crypto|forex)\.complementary-)/.test(String(r.strategy_id)) && completedRun.outcome_assumptions?.closeAtHorizon === true && Number(r.exit_price) > 0 && r.exit_time != null && r.net_r != null).map((r: Record<string, unknown>) => ({ ...r, id: r.candidate_id ?? r.id })));
            if (result.data.length < 500) {
                const trades = normalizeLedger(rows);
                if (!trades.length)
                    throw Error('No closed trades in latest completed run');
                return { trades, runId: completedRun.id };
            }
        }
        throw Error('Online history exceeds the 20,000-row browser limit');
    }
    finally {
        clearTimeout(timer);
    }
}
/** Network/pause failures fall back; a confirmed non-Admin role never does. */
export async function onlineOrSaved(db: Pick<SupabaseClient, 'from'>, userId: string, role: unknown, saved: () => Promise<LedgerTrade[]>) {
    try {
        return { mode: 'ONLINE' as const, ...await loadOnlineLedger(db, userId, role), notice: 'Latest completed validation run; historical data, not live orders.' };
    }
    catch (error) {
        if (error instanceof Error && error.message === 'ADMIN_REQUIRED')
            throw error;
        assertLabAdmin(role);
        return { mode: 'OFFLINE' as const, trades: await saved(), runId: null, notice: 'Supabase unavailable or no complete run. Using the saved research ledger.' };
    }
}
