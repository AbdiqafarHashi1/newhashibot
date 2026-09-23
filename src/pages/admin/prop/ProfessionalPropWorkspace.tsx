import { useEffect, useMemo, useState, type ReactNode } from "react";
import FrozenProductCertification from "./FrozenProductCertification";
import {
  ACCOUNT_SIZES,
  PROP_PROFILES,
  applyControl,
  buildChallengeWindows,
  calculatePayout,
  canonicalRunEvidence,
  deriveMonetaryRules,
  evaluateFunded,
  fundedSnapshotsFromTrades,
  realPropActivationBlockers,
  simulateFullChallenge,
  simulateFullChallengeWindows,
  simulateFundedSurvival,
  simulatePayoutCycle,
  type AccountControl,
  type CanonicalPropRun,
  type ChallengeWindowMode,
  type HistoricalTradeEvidence,
  type PropAccountConfiguration,
  type PropAccountSnapshot,
  type PropProfileId,
} from "../../../lib/prop/professionalPropEngine";
import {
  listCanonicalPropRuns,
  listConnectedMt5Truth,
  listPropAudit,
  listPropAccounts,
  persistPropAudit,
  persistSimulationRun,
  savePropAccount,
  type ConnectedMt5Truth,
} from "../../../lib/prop/propProductRepository";

const inputClass =
  "mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-white";
const makeConfig = (): PropAccountConfiguration => ({
  id: crypto.randomUUID(),
  label: "FTMO $100K",
  profileId: "FTMO_TWO_STEP",
  profileVersion: PROP_PROFILES.FTMO_TWO_STEP.profileVersion,
  accountSize: 100000,
  currency: "USD",
  mode: "HISTORICAL_PROP_SIMULATION",
  provider: "HISTORICAL",
  realPropActivationConfirmed: false,
  monthlyIncomeObjectivePct: 2,
  softProfitGuardPct: 1.7,
  noNewEntriesPct: 2,
  internalDailyLossLockPct: 2,
  retainedBufferPct: 0.5,
  control: "START",
});
const emptySnapshot = (size: number): PropAccountSnapshot => ({
  timestamp: new Date().toISOString(),
  startingBalance: size,
  balance: size,
  equity: size,
  startOfDayBalance: size,
  closedPnl: 0,
  floatingPnl: 0,
  dailyClosedPnl: 0,
  openRisk: 0,
  openPositions: 0,
  pendingExecutableOrders: 0,
  tradingDays: 0,
  brokerTruth: false,
});

export default function ProfessionalPropWorkspace() {
  const [accounts, setAccounts] = useState<PropAccountConfiguration[]>([]);
  const [selected, setSelected] = useState("");
  const [runs, setRuns] = useState<CanonicalPropRun[]>([]);
  const [runId, setRunId] = useState("");
  const [mt5, setMt5] = useState<ConnectedMt5Truth[]>([]);
  const [debugPnl, setDebugPnl] = useState(
    "2500,2500,2500,2500,1250,1250,1250,1250",
  );
  const [debugMode, setDebugMode] = useState(false);
  const [attempts, setAttempts] = useState(10);
  const [windowMode, setWindowMode] =
    useState<ChallengeWindowMode>("ROLLING_WINDOWS");
  const [survivalDays, setSurvivalDays] = useState(90);
  const [truth, setTruth] = useState(() => emptySnapshot(100000));
  const [full, setFull] = useState<ReturnType<
    typeof simulateFullChallenge
  > | null>(null);
  const [multi, setMulti] = useState<ReturnType<
    typeof simulateFullChallengeWindows
  > | null>(null);
  const [survival, setSurvival] = useState<ReturnType<
    typeof simulateFundedSurvival
  > | null>(null);
  const [cycle, setCycle] = useState<ReturnType<
    typeof simulatePayoutCycle
  > | null>(null);
  const [audit, setAudit] = useState<
    ReturnType<typeof applyControl>["audit"][]
  >([]);
  const [status, setStatus] = useState("Loading server state…");

  useEffect(() => {
    void Promise.all([
      listPropAccounts(),
      listCanonicalPropRuns(),
      listConnectedMt5Truth(),
    ])
      .then(([persisted, canonicalRuns, connected]) => {
        setAccounts(persisted.map((item) => item.config));
        setRuns(canonicalRuns);
        setMt5(connected);
        setSelected(persisted[0]?.config.id ?? "");
        setRunId(canonicalRuns[0]?.id ?? "");
        setStatus("Server state loaded");
      })
      .catch((error: Error) =>
        setStatus(`Server unavailable: ${error.message}`),
      );
  }, []);
  useEffect(() => {
    if (!selected) return;
    void listPropAudit(selected)
      .then(setAudit)
      .catch((error: Error) =>
        setStatus(`Audit load failed: ${error.message}`),
      );
  }, [selected]);

  const account = accounts.find((item) => item.id === selected) ?? accounts[0];
  const profile = account
    ? PROP_PROFILES[account.profileId]
    : PROP_PROFILES.FTMO_TWO_STEP;
  const selectedRun = runs.find((run) => run.id === runId);
  const debugTrades = useMemo<HistoricalTradeEvidence[]>(
    () =>
      debugPnl
        .split(",")
        .map(Number)
        .filter(Number.isFinite)
        .map((netPnl, index) => ({
          id: `debug-${index}`,
          closedAt: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
          netPnl,
          provenance: "HISTORICAL_SIMULATION",
        })),
    [debugPnl],
  );
  const trades =
    selectedRun && !debugMode
      ? canonicalRunEvidence(selectedRun)
      : debugMode
        ? debugTrades
        : [];
  const limits = deriveMonetaryRules(profile, account?.accountSize ?? 100000);
  const funded = account ? evaluateFunded(account, truth, profile) : null;
  const payout = account
    ? calculatePayout(
        Math.max(0, truth.closedPnl),
        profile.payout.profitSplitPct ?? 0,
        "WITHDRAW_RECOMMENDED",
        0,
        (account.accountSize * account.retainedBufferPct) / 100,
      )
    : null;
  const boundMt5 = mt5.find(
    (item) => item.accountId === account?.accountReference,
  );
  const realBlockers = account
    ? realPropActivationBlockers(
        account,
        profile,
        boundMt5?.connectionStatus === "ONLINE" && Boolean(boundMt5.snapshot),
      )
    : [];

  const replaceAccount = async (
    next: PropAccountConfiguration,
    state = funded?.state ?? "NOT_STARTED",
  ) => {
    setAccounts((items) =>
      items.map((item) => (item.id === next.id ? next : item)),
    );
    try {
      await savePropAccount({
        config: next,
        state,
        payoutState: funded?.payoutStatus ?? "NOT_ELIGIBLE",
        updatedAt: new Date().toISOString(),
      });
      setStatus("Saved to server");
    } catch (error) {
      setStatus(`Save failed: ${(error as Error).message}`);
    }
  };
  const update = (patch: Partial<PropAccountConfiguration>) =>
    account && void replaceAccount({ ...account, ...patch });
  const add = async () => {
    const next = makeConfig();
    setAccounts((items) => [...items, next]);
    setSelected(next.id);
    setTruth(emptySnapshot(next.accountSize));
    await replaceAccount(next);
  };
  const control = async (value: AccountControl) => {
    if (!account) return;
    const applied = applyControl(account, value, {
      ...truth,
      timestamp: new Date().toISOString(),
    });
    await replaceAccount(applied.config, applied.audit.newState);
    try {
      await persistPropAudit(applied.audit);
      setAudit((items) => [applied.audit, ...items]);
    } catch (error) {
      setStatus(`Audit save failed: ${(error as Error).message}`);
    }
  };
  const runFull = async () => {
    if (!account || !trades.length)
      return setStatus(
        "Select a canonical run or explicitly enable DEBUG/CUSTOM input",
      );
    const result = simulateFullChallenge(profile, account, trades);
    setFull(result);
    await replaceAccount(
      account,
      result.status === "FUNDED"
        ? "FUNDED_ACTIVE"
        : (result.verification?.state ?? result.phase1.state),
    );
    if (selectedRun)
      await persistSimulationRun({
        accountId: account.id,
        runType: "FULL_CHALLENGE",
        canonicalRunId: selectedRun.id,
        canonicalRunHash: selectedRun.runHash,
        result,
      }).catch((error: Error) =>
        setStatus(`Result save failed: ${error.message}`),
      );
  };
  const runMulti = () => {
    if (!account || !trades.length) return;
    const hash = selectedRun?.runHash ?? "debug-custom";
    const windows = buildChallengeWindows(
      trades,
      attempts,
      windowMode,
      60,
      20260910,
    );
    setMulti(simulateFullChallengeWindows(profile, account, windows, hash));
  };
  const runSurvival = () => {
    if (!account) return;
    const source = full?.remainingTrades.length ? full.remainingTrades : trades;
    const snapshots = fundedSnapshotsFromTrades(account, source, survivalDays);
    setSurvival(simulateFundedSurvival(account, profile, snapshots));
    setCycle(simulatePayoutCycle(account, profile, snapshots));
  };
  const bindMt5 = (id: string) => {
    if (!account) return;
    const connection = mt5.find((item) => item.accountId === id);
    const next = {
      ...account,
      accountReference: id,
      provider: "MT5",
      broker: connection?.broker,
      server: connection?.server,
    } as PropAccountConfiguration;
    if (connection?.connectionStatus === "ONLINE" && connection.snapshot) {
      setTruth(connection.snapshot);
      void replaceAccount(
        next,
        evaluateFunded(next, connection.snapshot, profile).state,
      );
    } else {
      void replaceAccount(next, "BROKER_OFFLINE");
      setStatus(
        `MT5 ${connection?.connectionStatus ?? "OFFLINE"}: live truth not applied`,
      );
    }
  };

  return (
    <><FrozenProductCertification/><section
      data-testid="professional-prop-operations"
      className="space-y-5 rounded-2xl border border-blue-500/30 bg-zinc-950 p-5"
    >
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">PROP OPERATIONS</h2>
          <p className="text-xs text-zinc-400">
            Canonical historical evidence · server controls · authenticated MT5
            truth
          </p>
        </div>
        <button
          onClick={() => void add()}
          className="rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white"
        >
          CREATE PROP ACCOUNT
        </button>
      </header>
      <p role="status" className="text-xs text-amber-300">
        {status}
      </p>
      {!account ? (
        <p className="text-sm text-zinc-400">Create an account to begin.</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-5">
            <Field label="Account">
              <select
                className={inputClass}
                value={account.id}
                onChange={(event) => setSelected(event.target.value)}
              >
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Firm / Program">
              <select
                className={inputClass}
                value={account.profileId}
                onChange={(event) => {
                  const id = event.target.value as PropProfileId;
                  update({
                    profileId: id,
                    profileVersion: PROP_PROFILES[id].profileVersion,
                  });
                }}
              >
                <option value="FTMO_TWO_STEP">FTMO 2-Step</option>
                <option value="FUNDEDNEXT_STELLAR_TWO_STEP">
                  FundedNext Stellar Two-Step
                </option>
                <option value="CUSTOM">Custom / User Configured</option>
              </select>
            </Field>
            <Field label="Account Size">
              <select
                className={inputClass}
                value={account.accountSize}
                onChange={(event) => {
                  const size = Number(event.target.value);
                  update({ accountSize: size });
                  setTruth(emptySnapshot(size));
                }}
              >
                {ACCOUNT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    ${size.toLocaleString()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mode">
              <select
                className={inputClass}
                value={account.mode}
                onChange={(event) =>
                  update({
                    mode: event.target
                      .value as PropAccountConfiguration["mode"],
                    provider:
                      event.target.value === "HISTORICAL_PROP_SIMULATION"
                        ? "HISTORICAL"
                        : "MT5",
                  })
                }
              >
                <option value="HISTORICAL_PROP_SIMULATION">
                  Historical Prop Simulation
                </option>
                <option value="VIRTUAL_PROP_ON_MT5">Virtual Prop on MT5</option>
                <option value="REAL_PROP">
                  Real Prop (locked until verified)
                </option>
              </select>
            </Field>
            <Field label="Profile">
              <div className={inputClass}>{profile.verificationStatus}</div>
            </Field>
          </div>
          {account.mode !== "HISTORICAL_PROP_SIMULATION" && (
            <Panel title="MT5 Account Truth">
              <select
                className={inputClass}
                value={account.accountReference ?? ""}
                onChange={(event) => bindMt5(event.target.value)}
              >
                <option value="">Select authenticated MT5 account</option>
                {mt5.map((item) => (
                  <option key={item.accountId} value={item.accountId}>
                    {item.broker} · {item.accountReference} ·{" "}
                    {item.connectionStatus}
                  </option>
                ))}
              </select>
              <p
                className={
                  boundMt5?.connectionStatus === "ONLINE"
                    ? "text-xs text-emerald-400"
                    : "text-xs text-red-400"
                }
              >
                {boundMt5
                  ? `${boundMt5.connectionStatus} · ${boundMt5.lastUpdate ?? "never"}`
                  : "BROKER_OFFLINE · no account selected"}
              </p>
            </Panel>
          )}
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Balance" value={truth.balance} />
            <Stat label="Equity" value={truth.equity} />
            <Stat label="Firm Daily Loss" value={limits.dailyLossAmount} />
            <Stat label="Firm Max Loss" value={limits.maxLossAmount} />
            <Stat
              label="HashiBot Safety"
              value={
                (account.accountSize * account.internalDailyLossLockPct) / 100
              }
            />
            <Stat
              label="Objective"
              value={
                (account.accountSize * account.monthlyIncomeObjectivePct) / 100
              }
            />
            <Stat label="Open Positions" value={truth.openPositions} />
            <Stat
              label="Pending Orders"
              value={truth.pendingExecutableOrders}
            />
          </div>
          <Panel title="Canonical Historical Run">
            <select
              aria-label="Canonical historical run"
              className={inputClass}
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
            >
              <option value="">Select completed canonical Backtest run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label}
                </option>
              ))}
            </select>
            {selectedRun && (
              <p className="text-xs text-zinc-400">
                {selectedRun.strategyId}@{selectedRun.strategyVersion} ·{" "}
                {selectedRun.symbol} · {selectedRun.trades.length} canonical
                trades · {selectedRun.runHash}
              </p>
            )}
            <label className="flex items-center gap-2 text-xs text-amber-300">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(event) => setDebugMode(event.target.checked)}
              />{" "}
              DEBUG/CUSTOM MANUAL PNL
            </label>
            {debugMode && (
              <textarea
                aria-label="Debug chronological PnL"
                className={inputClass}
                value={debugPnl}
                onChange={(event) => setDebugPnl(event.target.value)}
              />
            )}
            <Action onClick={() => void runFull()}>RUN FULL CHALLENGE</Action>
            {full && (
              <div
                data-testid="full-challenge-timeline"
                className="space-y-1 text-xs text-zinc-300"
              >
                <b>{full.status}</b>
                {full.timeline.map((item) => (
                  <p key={`${item.state}:${item.timestamp}`}>
                    {item.timestamp.slice(0, 10)} · {item.state} ·{" "}
                    {item.reasonCodes.join(", ")}
                  </p>
                ))}
              </div>
            )}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Multi-Challenge">
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Attempts"
                  className={inputClass}
                  value={attempts}
                  onChange={(event) => setAttempts(Number(event.target.value))}
                >
                  {[10, 25, 50, 100].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Window mode"
                  className={inputClass}
                  value={windowMode}
                  onChange={(event) =>
                    setWindowMode(event.target.value as ChallengeWindowMode)
                  }
                >
                  {[
                    "ROLLING_WINDOWS",
                    "MONTHLY_STARTS",
                    "QUARTERLY_STARTS",
                    "SEEDED_RANDOM",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <Action onClick={runMulti}>RUN MULTI-CHALLENGE</Action>
              {multi && (
                <p className="text-xs text-zinc-300">
                  {multi.passCount}/{multi.attemptCount} passed · HISTORICAL
                  PASS RATE {multi.historicalPassRate.toFixed(1)}% · worst DD{" "}
                  {multi.worstDrawdown.toFixed(2)}%
                </p>
              )}
            </Panel>
            <Panel title="Funded Survival / Payout Cycle">
              <select
                aria-label="Survival duration"
                className={inputClass}
                value={survivalDays}
                onChange={(event) =>
                  setSurvivalDays(Number(event.target.value))
                }
              >
                {[30, 60, 90, 180, 365].map((value) => (
                  <option key={value} value={value}>
                    {value} days
                  </option>
                ))}
              </select>
              <Action onClick={runSurvival}>RUN FUNDED SURVIVAL</Action>
              {survival && (
                <p className="text-xs text-zinc-300">
                  {survival.survived ? "SURVIVED" : "BREACHED"} ·{" "}
                  {survival.daysSurvived} days · DD{" "}
                  {survival.maxDrawdown.toFixed(2)}%
                </p>
              )}
              {cycle && (
                <div className="text-xs text-zinc-400">
                  <p>
                    {cycle.cycles} simulated payout cycles · $
                    {cycle.modeledRewards.toLocaleString()} modeled reward
                  </p>
                  {cycle.events.slice(-6).map((event, index) => (
                    <p key={`${event.timestamp}:${event.state}:${index}`}>
                      {event.state}{" "}
                      <span className="text-amber-300">SIMULATED</span>
                    </p>
                  ))}
                </div>
              )}
            </Panel>
          </div>
          <Panel title="Funded / Execution Decision">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span>State</span>
              <b>{funded?.state}</b>
              <span>Last Prop decision</span>
              <b>{funded?.entryDecision}</b>
              <span>Existing management</span>
              <b>{funded?.manageExisting ? "ON" : "OFF"}</b>
              <span>Force close</span>
              <b>{funded?.forceClose ? "YES" : "NO"}</b>
              <span>Payout</span>
              <b>{funded?.payoutStatus}</b>
              <span>Recommended reward</span>
              <b>${payout?.requestedReward.toLocaleString()}</b>
            </div>
            {account.mode === "REAL_PROP" && (
              <div className="mt-2 text-xs text-red-400">
                Activation blocked: {realBlockers.join(", ") || "none"}
              </div>
            )}
          </Panel>
          <Panel title="Server-Persisted Account Controls">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "START",
                  "PAUSE_NEW_ENTRIES",
                  "RESUME",
                  "MANAGE_ONLY",
                  "STOP_AFTER_FLAT",
                  "EMERGENCY_STOP",
                ] as AccountControl[]
              ).map((value) => (
                <Action key={value} onClick={() => void control(value)}>
                  {value.replace(/_/g, " ")}
                </Action>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              New-entry blocks do not disable management, protection, or
              reconciliation.
            </p>
          </Panel>
          <Panel title="Audit History">
            {audit.length ? (
              audit.map((event) => (
                <p key={event.id} className="text-xs text-zinc-400">
                  {event.timestamp} · {event.oldState} → {event.newState} ·{" "}
                  {event.reasonCodes.join(", ")}
                </p>
              ))
            ) : (
              <p className="text-xs text-zinc-500">
                No new control events in this session.
              </p>
            )}
          </Panel>
        </>
      )}
    </section></>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs text-zinc-400">
      {label}
      {children}
    </label>
  );
}
function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded border border-zinc-800 p-3">
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div className="font-semibold text-white">
        {value === null
          ? "Pending"
          : label.includes("Positions") || label.includes("Orders")
            ? value
            : `$${value.toLocaleString()}`}
      </div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded border border-zinc-800 p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      {children}
    </div>
  );
}
function Action({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-zinc-800 px-3 py-2 text-xs text-white hover:bg-zinc-700"
    >
      {children}
    </button>
  );
}
