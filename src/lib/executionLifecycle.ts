export const LIFECYCLE_STATES = [
  'SIGNAL_CREATED',
  'QUALIFIED',
  'POSITION_SIZED',
  'ORDER_SUBMITTED',
  'FILLED',
  'PROTECTED',
  'TP1',
  'BREAKEVEN',
  'TP2',
  'CLOSED',
  'ARCHIVED',
  'FAILED',
  'RECOVERY_REQUIRED',
] as const;

export type LifecycleState = typeof LIFECYCLE_STATES[number];

export const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  SIGNAL_CREATED: ['QUALIFIED', 'FAILED'],
  QUALIFIED: ['POSITION_SIZED', 'FAILED'],
  POSITION_SIZED: ['ORDER_SUBMITTED', 'FAILED'],
  ORDER_SUBMITTED: ['FILLED', 'FAILED'],
  FILLED: ['PROTECTED', 'RECOVERY_REQUIRED', 'FAILED'],
  PROTECTED: ['TP1', 'BREAKEVEN', 'TP2', 'CLOSED', 'RECOVERY_REQUIRED'],
  TP1: ['BREAKEVEN', 'TP2', 'CLOSED'],
  BREAKEVEN: ['TP2', 'CLOSED'],
  TP2: ['CLOSED'],
  CLOSED: ['ARCHIVED'],
  ARCHIVED: [],
  FAILED: [],
  RECOVERY_REQUIRED: ['PROTECTED', 'CLOSED', 'FAILED'],
};

export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalState(state: LifecycleState): boolean {
  return state === 'ARCHIVED' || state === 'FAILED';
}

export function requiresProtection(state: LifecycleState): boolean {
  return state === 'FILLED';
}

export function isRecoveryState(state: LifecycleState): boolean {
  return state === 'RECOVERY_REQUIRED';
}

export interface LifecycleEvent {
  execution_order_id: string;
  provider: 'binance' | 'bybit' | 'mt5' | string;
  symbol: string;
  lifecycle_state: LifecycleState;
  previous_state: LifecycleState | null;
  event_type: string;
  event_message: string;
  metadata: Record<string, unknown>;
}

export function validateLifecycleTransition(
  from: LifecycleState | null,
  to: LifecycleState,
): { valid: boolean; error: string | null } {
  if (!from) return { valid: true, error: null };
  if (isValidTransition(from, to)) return { valid: true, error: null };
  return {
    valid: false,
    error: `Invalid lifecycle transition: ${from} -> ${to}`,
  };
}

export function shouldTriggerRecovery(
  state: LifecycleState,
  hasSL: boolean,
  hasTP: boolean,
): boolean {
  if (state === 'FILLED' && (!hasSL || !hasTP)) return true;
  return false;
}

export function getLifecycleStage(state: LifecycleState): 'pre_execution' | 'execution' | 'protection' | 'management' | 'terminal' | 'recovery' {
  switch (state) {
    case 'SIGNAL_CREATED':
    case 'QUALIFIED':
    case 'POSITION_SIZED':
      return 'pre_execution';
    case 'ORDER_SUBMITTED':
    case 'FILLED':
      return 'execution';
    case 'PROTECTED':
      return 'protection';
    case 'TP1':
    case 'BREAKEVEN':
    case 'TP2':
    case 'CLOSED':
      return 'management';
    case 'ARCHIVED':
    case 'FAILED':
      return 'terminal';
    case 'RECOVERY_REQUIRED':
      return 'recovery';
    default:
      return 'terminal';
  }
}
