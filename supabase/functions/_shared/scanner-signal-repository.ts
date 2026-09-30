/** The only durable write boundary for scanner decisions and canonical signals. */
export const SCANNER_SIGNAL_CONTRACT_VERSION = "scanner-signal/v2" as const;

const stable = (value: unknown): string => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
function hash(value: unknown): string { let h = 2166136261; for (const c of stable(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }

export interface ScannerSignalIdentityInput { market: string; symbol: string; timeframe: string; candleCloseTime: string; strategyId: string; strategyVersion: string; configurationVersion: string; side: string; }
export function scannerSignalIdentity(input: ScannerSignalIdentityInput): string { return `sig_v2_${hash(input)}`; }
export function scannerCycleKey(input: Omit<ScannerSignalIdentityInput, "side">): string { return `cycle_v2_${hash(input)}`; }
export function scannerConfigurationVersion(value: unknown): string { return `config_v2_${hash(value)}`; }
export function immutableSignalHash(payload: Record<string, unknown>): string { return `content_v2_${hash({ market_type: payload.market_type, symbol: payload.symbol, timeframe: payload.timeframe, direction: payload.direction, strategy_id: payload.strategy_id, strategy_version: payload.strategy_version, configuration_version: payload.configuration_version, candle_close_time: payload.candle_close_time, entry_low: payload.entry_low, entry_high: payload.entry_high, stop_loss: payload.stop_loss, tp1: payload.tp1, tp2: payload.tp2, grade: payload.grade, candidate_id: payload.candidate_id })}`; }

export interface ScannerDecisionCommit { cycleKey: string; runId: string; scope: string; decision: "SIGNAL" | "NO_TRADE" | "REJECTED"; reasonCodes: readonly string[]; arbitration: Readonly<Record<string, unknown>>; signal?: Record<string, unknown>; enqueuePublication?: boolean; }
export interface ScannerDecisionCommitResult { decision_id: string; signal_id: string | null; publication_work_id: string | null; idempotent: boolean; }
export async function commitScannerDecision(client: { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }, commit: ScannerDecisionCommit): Promise<ScannerDecisionCommitResult> {
  const signal = commit.signal ? { ...commit.signal, contract_version: SCANNER_SIGNAL_CONTRACT_VERSION, immutable_hash: immutableSignalHash(commit.signal) } : null;
  const { data, error } = await client.rpc("commit_scanner_signal_decision", { p_cycle_key: commit.cycleKey, p_run_id: commit.runId, p_scope: commit.scope, p_decision: commit.decision, p_reason_codes: [...commit.reasonCodes], p_arbitration: commit.arbitration, p_signal: signal, p_enqueue_publication: commit.enqueuePublication === true });
  if (error) throw new Error(`SCANNER_SIGNAL_COMMIT_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("SCANNER_SIGNAL_COMMIT_INVALID_RESULT");
  return row as ScannerDecisionCommitResult;
}
