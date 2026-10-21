import { immutableSignalHash } from './scanner-signal-repository.ts';
import { stableFingerprint } from './strategy-plan.ts';

/** Publication consumes persisted scanner truth and the existing measured-release authority. */
export function assertPublishableSignal(signal: any, plan: any, release: any, now = Date.now()) {
  if (!signal || signal.contract_version !== 'scanner-signal/v2' || signal.source !== 'scanner' || signal.data_source !== 'REAL DATA' || signal.immutable_hash !== immutableSignalHash(signal)) throw Error('CANONICAL_SIGNAL_REQUIRED');
  if (!['waiting', 'active', 'new', 'approved'].includes(signal.status) || signal.arbitrator_decision?.final_decision !== 'approved') throw Error('SIGNAL_NOT_APPROVED');
  const created = Date.parse(signal.created_at), expires = Date.parse(signal.expires_at), candle = Date.parse(signal.candle_close_time);
  if (![created, expires, candle].every(Number.isFinite) || created > now + 5000 || candle > now + 5000 || now >= expires || now - created > 60 * 60_000) throw Error('SIGNAL_STALE_OR_INVALID_TIME');
  if (!release || release.state !== 'PROMOTED' || release.strategy_id !== signal.strategy_id || plan?.identity?.strategy_version !== signal.strategy_version || plan?.provenance?.measured_release_id !== release.id) throw Error('CURRENT_MEASURED_SIGNAL_RELEASE_REQUIRED');
  const config = release.immutable_configuration?.strategies?.find((s: any) => s.id === signal.strategy_id && s.enabled === true);
  if (!config || !Number.isFinite(config.minRiskReward) || config.minRiskReward <= 0) throw Error('MEASURED_SIGNAL_CONFIGURATION_INVALID');
  if (!config?.symbols?.includes(signal.symbol) || !config?.timeframes?.includes(signal.timeframe) || !plan.provenance.evaluated_parameters || stableFingerprint(config.parameters) !== stableFingerprint(plan.provenance.evaluated_parameters)) throw Error('MEASURED_SIGNAL_SCOPE_OR_PARAMETERS_MISMATCH');
  if (plan.provenance.candle_boundary?.closed_only !== true) throw Error('CLOSED_MARKET_DATA_REQUIRED');
  const { entry_low: low, entry_high: high, stop_loss: stop, tp1, tp2 } = signal;
  if (![low, high, stop, tp1, tp2].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0) || low > high) throw Error('INVALID_SIGNAL_LEVELS');
  const buy = /^(buy|long)$/i.test(signal.direction), sell = /^(sell|short)$/i.test(signal.direction);
  if (!(buy && stop < low && tp1 > high && tp2 >= tp1 || sell && stop > high && tp1 < low && tp2 <= tp1)) throw Error('INVALID_SIGNAL_DIRECTION_OR_GEOMETRY');
  // Use the least favorable entry in the zone, rather than inflating RR at its midpoint.
  const entry = buy ? high : low, risk = Math.abs(entry - stop), rr = Math.abs(tp2 - entry) / risk;
  if (!Number.isFinite(rr) || rr < config.minRiskReward) throw Error('SIGNAL_NET_RISK_REWARD_INSUFFICIENT');
  return signal;
}

export async function loadPublishableSignal(db: any, signalId: string) {
  const { data: signal, error } = await db.from('signals').select('*').eq('id', signalId).maybeSingle();
  if (error || !signal) throw Error('CANONICAL_SIGNAL_UNAVAILABLE');
  const [{ data: row, error: planError }, { data: release, error: releaseError }] = await Promise.all([
    db.from('certified_strategy_plans').select('strategy_plan').eq('candidate_id', signal.candidate_id).eq('strategy_id', signal.strategy_id).eq('strategy_version', signal.strategy_version).order('persisted_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('strategy_release_candidates').select('*').eq('strategy_id', signal.strategy_id).eq('state', 'PROMOTED').maybeSingle(),
  ]);
  if (planError || releaseError) throw Error('SIGNAL_QUALIFICATION_EVIDENCE_UNAVAILABLE');
  return assertPublishableSignal(signal, row?.strategy_plan, release);
}
