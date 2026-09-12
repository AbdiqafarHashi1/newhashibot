export type TruthState = 'READY' | 'BLOCKED' | 'NOT_CONFIGURED' | 'ONLINE' | 'OFFLINE' | 'STALE' | 'UNKNOWN';

export interface MT5TruthInput {
  backendAvailable: boolean;
  accountId?: string | null;
  bridgeId?: string | null;
  lastHeartbeatAt?: string | null;
  terminalAuthenticated?: boolean | null;
  fetchHistorySupported?: boolean | null;
  executionEnabled?: boolean | null;
  commandPathCertified?: boolean | null;
}

export interface MT5Readiness {
  bridge: Extract<TruthState, 'ONLINE' | 'OFFLINE' | 'STALE' | 'UNKNOWN'>;
  terminal: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  authenticated: 'YES' | 'NO' | 'UNKNOWN';
  history: Extract<TruthState, 'READY' | 'BLOCKED' | 'UNKNOWN'>;
  execution: Extract<TruthState, 'READY' | 'BLOCKED' | 'NOT_CONFIGURED' | 'UNKNOWN'>;
  blockers: string[];
}

export function mapMT5Readiness(input: MT5TruthInput, now = Date.now()): MT5Readiness {
  if (!input.backendAvailable) return { bridge: 'UNKNOWN', terminal: 'UNKNOWN', authenticated: 'UNKNOWN', history: 'UNKNOWN', execution: 'UNKNOWN', blockers: ['BACKEND UNAVAILABLE'] };
  const heartbeat = input.lastHeartbeatAt ? Date.parse(input.lastHeartbeatAt) : NaN;
  const age = Number.isFinite(heartbeat) ? now - heartbeat : Infinity;
  const bridge: MT5Readiness['bridge'] = !input.bridgeId || !Number.isFinite(heartbeat) ? 'UNKNOWN' : age > 120_000 ? 'OFFLINE' : age > 30_000 ? 'STALE' : 'ONLINE';
  const authenticated = input.terminalAuthenticated == null ? 'UNKNOWN' : input.terminalAuthenticated ? 'YES' : 'NO';
  const terminal = input.terminalAuthenticated == null ? 'UNKNOWN' : input.terminalAuthenticated ? 'CONNECTED' : 'DISCONNECTED';
  const blockers: string[] = [];
  if (!input.accountId) blockers.push('NO ACCOUNT SELECTED');
  if (bridge === 'UNKNOWN') blockers.push('BRIDGE STATUS UNKNOWN');
  if (bridge === 'OFFLINE') blockers.push('BRIDGE OFFLINE');
  if (bridge === 'STALE') blockers.push('HEARTBEAT STALE');
  if (authenticated === 'UNKNOWN') blockers.push('TERMINAL AUTH UNKNOWN');
  if (authenticated === 'NO') blockers.push('TERMINAL OFFLINE');
  if (input.fetchHistorySupported === false) blockers.push('FETCH_HISTORY UNSUPPORTED');
  if (input.fetchHistorySupported == null) blockers.push('FETCH_HISTORY CAPABILITY UNKNOWN');
  const history = blockers.length === 0 ? 'READY' : (input.fetchHistorySupported == null || bridge === 'UNKNOWN' || authenticated === 'UNKNOWN') ? 'UNKNOWN' : 'BLOCKED';
  const execution = input.executionEnabled == null ? 'NOT_CONFIGURED' : !input.executionEnabled ? 'BLOCKED' : input.commandPathCertified === true && history === 'READY' ? 'READY' : input.commandPathCertified == null ? 'UNKNOWN' : 'BLOCKED';
  return { bridge, terminal, authenticated, history, execution, blockers };
}

export type DatasetProvenance = 'REAL' | 'CACHED REAL' | 'SIMULATION' | 'UNAVAILABLE';
export function mapDatasetProvenance(provider: string, cacheHit: boolean, available = true): DatasetProvenance {
  if (!available) return 'UNAVAILABLE';
  if (provider === 'SIMULATION') return 'SIMULATION';
  return cacheHit ? 'CACHED REAL' : 'REAL';
}

export interface ForwardPrerequisites { qualified: boolean; frozen: boolean; providerReady: boolean; accountAssigned: boolean; productEligible: boolean; providerCertified: boolean; riskEligible: boolean }
export function forwardBlockers(p: ForwardPrerequisites): string[] {
  return ([['qualified','NOT QUALIFIED'],['frozen','CONFIGURATION NOT FROZEN'],['providerReady','PROVIDER NOT READY'],['accountAssigned','NO ACCOUNT ASSIGNED'],['productEligible','PRODUCT NOT ELIGIBLE'],['providerCertified','PROVIDER NOT CERTIFIED'],['riskEligible','RISK/ACCOUNT INELIGIBLE']] as const).filter(([key]) => !p[key]).map(([, reason]) => reason);
}

export type ResearchStage = 'DATA'|'BACKTEST'|'VALIDATE'|'PROP'|'QUALIFY'|'FREEZE'|'FORWARD';
export interface ResearchWorkflowTruth {dataReady:boolean;backtestComplete:boolean;validationComplete:boolean;fullPropComplete:boolean;multiChallengeComplete:boolean;qualified:boolean;frozen:boolean;forwardStarted:boolean}
export function researchWorkflowStages(t:ResearchWorkflowTruth):Record<ResearchStage,'COMPLETE'|'READY'|'LOCKED'>{
  const prop=t.fullPropComplete&&t.multiChallengeComplete;
  return {DATA:t.dataReady?'COMPLETE':'READY',BACKTEST:t.backtestComplete?'COMPLETE':t.dataReady?'READY':'LOCKED',VALIDATE:t.validationComplete?'COMPLETE':t.backtestComplete?'READY':'LOCKED',PROP:prop?'COMPLETE':t.validationComplete?'READY':'LOCKED',QUALIFY:t.qualified?'COMPLETE':prop?'READY':'LOCKED',FREEZE:t.frozen?'COMPLETE':t.qualified?'READY':'LOCKED',FORWARD:t.forwardStarted?'COMPLETE':t.frozen?'READY':'LOCKED'};
}
