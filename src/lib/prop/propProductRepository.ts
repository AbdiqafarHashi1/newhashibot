import { supabase } from "../supabase";
import type { CanonicalCompletedTradeResult } from "../../../supabase/functions/_shared/trading-domain/contracts.ts";
import type {
  PropAccountConfiguration,
  PropAccountSnapshot,
  PropAuditEvent,
  CanonicalPropRun,
} from "./professionalPropEngine";

export interface PersistedPropAccount {
  config: PropAccountConfiguration;
  state: string;
  payoutState: string;
  updatedAt: string;
}

export async function listPropAccounts(): Promise<PersistedPropAccount[]> {
  const { data, error } = await supabase
    .from("prop_account_configs")
    .select("configuration,current_state,payout_state,updated_at")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    config: row.configuration as PropAccountConfiguration,
    state: String(row.current_state),
    payoutState: String(row.payout_state),
    updatedAt: String(row.updated_at),
  }));
}

export async function savePropAccount(
  account: PersistedPropAccount,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("AUTHENTICATED_OPERATOR_REQUIRED");
  const config = account.config;
  const { error } = await supabase.from("prop_account_configs").upsert(
    {
      id: config.id,
      user_id: auth.user.id,
      profile_id: config.profileId,
      profile_version: config.profileVersion,
      mode: config.mode,
      account_size: config.accountSize,
      currency: config.currency,
      mt5_account_id: config.accountReference || null,
      configuration: config,
      current_state: account.state,
      manual_control: config.control,
      payout_state: account.payoutState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function persistPropAudit(event: PropAuditEvent): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("AUTHENTICATED_OPERATOR_REQUIRED");
  const { error } = await supabase.from("prop_audit_events").insert({
    id: event.id,
    user_id: auth.user.id,
    prop_account_id: event.accountId,
    occurred_at: event.timestamp,
    actor: event.actor,
    old_state: event.oldState,
    new_state: event.newState,
    trigger: event.trigger,
    profile_version: event.profileVersion,
    reason_codes: event.reasonCodes,
    snapshot: event.snapshot,
  });
  if (error) throw error;
}

export async function listPropAudit(
  accountId: string,
): Promise<PropAuditEvent[]> {
  const { data, error } = await supabase
    .from("prop_audit_events")
    .select(
      "id,occurred_at,actor,old_state,new_state,trigger,profile_version,reason_codes,snapshot",
    )
    .eq("prop_account_id", accountId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    timestamp: String(row.occurred_at),
    accountId,
    actor: row.actor as PropAuditEvent["actor"],
    oldState: String(row.old_state),
    newState: String(row.new_state),
    trigger: String(row.trigger),
    profileVersion: String(row.profile_version),
    reasonCodes: Array.isArray(row.reason_codes)
      ? row.reason_codes.map(String)
      : [],
    snapshot: row.snapshot as PropAccountSnapshot,
  }));
}

export async function persistSimulationRun(input: {
  accountId: string;
  runType: string;
  canonicalRunId: string;
  canonicalRunHash: string;
  result: unknown;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("AUTHENTICATED_OPERATOR_REQUIRED");
  const { error } = await supabase.from("prop_simulation_runs").insert({
    user_id: auth.user.id,
    prop_account_id: input.accountId,
    run_type: input.runType,
    canonical_run_id: input.canonicalRunId,
    canonical_run_hash: input.canonicalRunHash,
    result: input.result,
  });
  if (error) throw error;
}

export async function listCanonicalPropRuns(): Promise<CanonicalPropRun[]> {
  const { data, error } = await supabase
    .from("backtest_runs")
    .select("id,strategy_name,symbol,dataset_name,result_summary,created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row: Record<string, unknown>) => {
    const summary = row.result_summary as Record<string, unknown>;
    const trades = Array.isArray(summary.canonicalCompletedTrades)
      ? (summary.canonicalCompletedTrades as CanonicalCompletedTradeResult[])
      : [];
    if (!trades.length) return [];
    return [
      {
        id: String(row.id),
        label: `${row.strategy_name} · ${row.symbol} · ${String(row.created_at).slice(0, 10)}`,
        strategyId: String(summary.strategyId ?? row.strategy_name),
        strategyVersion: String(
          summary.strategyVersion ?? trades[0].strategyVersion,
        ),
        symbol: String(row.symbol),
        datasetIds: Array.isArray(summary.datasetIds)
          ? summary.datasetIds.map(String)
          : trades[0].datasetIds,
        runHash: String(summary.runHash ?? trades[0].runReference),
        executionModelVersion: String(
          summary.executionModelVersion ?? trades[0].costs.version,
        ),
        trades,
      },
    ];
  });
}

export async function persistResearchAnalysis(
  runId: string,
  analysis: Record<string, unknown>,
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from("backtest_runs")
    .select("result_summary")
    .eq("id", runId)
    .single();
  if (readError) throw readError;
  const { error } = await supabase
    .from("backtest_runs")
    .update({
      result_summary: {
        ...((current?.result_summary as Record<string, unknown>) ?? {}),
        researchAnalysis: analysis,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw error;
}

export async function persistQualificationCampaign(campaign: {
  campaignId: string;
  campaignHash: string;
  policyVersion: string;
  status: string;
  variantsTested: number;
  eliminated: number;
  recommendation: string;
  qualifiedSet: unknown;
  results: readonly {
    binding: unknown;
    variant: { configId: string; configVersion: string; strategyParameters: unknown; researchPolicyParameters: unknown };
    status: string;
    stageReached: string;
    eliminationReasons: readonly string[];
    thesisDiagnostics: readonly string[];
    researchScore: number;
    pipeline: { runHash: string };
    stages: unknown;
    evidence: unknown;
  }[];
}): Promise<void> {
  const summary = {
    campaignId: campaign.campaignId,
    campaignHash: campaign.campaignHash,
    policyVersion: campaign.policyVersion,
    variantsTested: campaign.variantsTested,
    eliminated: campaign.eliminated,
    recommendation: campaign.recommendation,
    qualifiedSet: campaign.qualifiedSet,
    variants: campaign.results.map((result) => ({
      binding: result.binding,
      variant: result.variant,
      status: result.status,
      stageReached: result.stageReached,
      eliminationReasons: result.eliminationReasons,
      thesisDiagnostics: result.thesisDiagnostics,
      researchScore: result.researchScore,
      pipelineRunHash: result.pipeline.runHash,
      stages: result.stages,
      evidence: result.evidence,
    })),
  };
  const { error } = await supabase.from("backtest_runs").insert({
    mode_slug: "qualification_campaign",
    strategy_name: "QUALIFICATION_CAMPAIGN",
    symbol: "MULTI",
    timeframe: "MULTI",
    dataset_name: campaign.campaignHash,
    status: campaign.status.toLowerCase(),
    result_summary: summary,
  });
  if (error) throw error;
}

/** Starts a forward run without claiming a fill; provider observations remain truth. */
export async function persistForwardValidationRun(run: Record<string, unknown>): Promise<void> {
  if (run.status !== "READY") throw new Error("FORWARD_VALIDATION_NOT_READY");
  const { error } = await supabase.from("backtest_runs").insert({
    mode_slug: "forward_validation",
    strategy_name: run.strategyId,
    symbol: Array.isArray(run.symbols) ? run.symbols.join(",") : "MULTI",
    timeframe: Array.isArray(run.timeframes) ? run.timeframes.join(",") : "MULTI",
    dataset_name: run.qualifiedSetVersion,
    status: "running",
    result_summary: { forwardValidation: run, truthStatus: "AWAITING_PROVIDER_OBSERVATIONS" },
  });
  if (error) throw error;
}

export async function getForwardAccountReadiness(accountId: string): Promise<{accountId:string;active:boolean;providerCertificationStatus:string}> {
  const { data, error } = await supabase.from("connected_execution_accounts")
    .select("id,enabled,execution_enabled,provider_certification_status")
    .eq("id", accountId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("EXECUTION_ACCOUNT_NOT_FOUND");
  return { accountId:String(data.id), active:Boolean(data.enabled&&data.execution_enabled), providerCertificationStatus:String(data.provider_certification_status??"EXTERNAL_VERIFICATION_REQUIRED") };
}

export interface ConnectedMt5Truth {
  accountId: string;
  broker: string;
  server: string;
  accountReference: string;
  connectionStatus: "ONLINE" | "OFFLINE" | "STALE";
  lastUpdate: string | null;
  snapshot: PropAccountSnapshot | null;
}

export async function listConnectedMt5Truth(
  now = Date.now(),
): Promise<ConnectedMt5Truth[]> {
  const { data, error } = await supabase
    .from("mt5_accounts_safe")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const lastUpdate =
      String(row.last_sync_at ?? row.last_heartbeat_at ?? "") || null;
    const age = lastUpdate
      ? now - Date.parse(lastUpdate)
      : Number.POSITIVE_INFINITY;
    const connected =
      row.connection_status === "connected" &&
      row.provider_health !== "unhealthy";
    const status = !connected ? "OFFLINE" : age > 120_000 ? "STALE" : "ONLINE";
    const balance = Number(row.balance);
    const equity = Number(row.equity);
    const hasTruth =
      Number.isFinite(balance) &&
      Number.isFinite(equity) &&
      Boolean(lastUpdate);
    return {
      accountId: String(row.id),
      broker: String(row.broker ?? ""),
      server: String(row.server ?? ""),
      accountReference: String(row.account_number_masked ?? ""),
      connectionStatus: status,
      lastUpdate,
      snapshot: hasTruth
        ? {
            timestamp: lastUpdate!,
            startingBalance: Number(row.starting_balance ?? balance),
            balance,
            equity,
            startOfDayBalance: Number(row.daily_starting_balance ?? balance),
            closedPnl: Number(
              row.closed_pnl ??
                balance - Number(row.starting_balance ?? balance),
            ),
            floatingPnl: Number(row.floating_pnl ?? equity - balance),
            dailyClosedPnl: Number(row.daily_closed_pnl ?? 0),
            openRisk: Number(row.open_risk ?? 0),
            openPositions: Number(row.open_positions ?? 0),
            pendingExecutableOrders: Number(row.pending_orders ?? 0),
            tradingDays: Number(row.trading_days ?? 0),
            brokerTruth: true,
          }
        : null,
    };
  });
}
