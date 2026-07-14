import {
  ENVIRONMENT_IDS,
  EXECUTION_STATUSES,
  EXCHANGE_ORDER_SIDES,
  MONITORING_STATUSES,
  POSITION_SIDES,
  PROTECTION_STATUSES,
  PROVIDER_IDS,
  RECOVERY_STATUSES,
  REPORTING_STATUSES,
  SIGNAL_DIRECTIONS,
  TRADE_LIFECYCLE_STATES,
  type EnvironmentId,
  type ExecutionStatus,
  type ExchangeOrderSide,
  type MonitoringStatus,
  type PositionSide,
  type ProtectionStatus,
  type ProviderId,
  type RecoveryStatus,
  type ReportingStatus,
  type RuntimeStatusContract,
  type SignalDirection,
  type TradeLifecycleState,
} from './types.js';

function hasValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function isTradeLifecycleState(value: unknown): value is TradeLifecycleState {
  return hasValue(TRADE_LIFECYCLE_STATES, value);
}

export function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return hasValue(EXECUTION_STATUSES, value);
}

export function isProtectionStatus(value: unknown): value is ProtectionStatus {
  return hasValue(PROTECTION_STATUSES, value);
}

export function isMonitoringStatus(value: unknown): value is MonitoringStatus {
  return hasValue(MONITORING_STATUSES, value);
}

export function isRecoveryStatus(value: unknown): value is RecoveryStatus {
  return hasValue(RECOVERY_STATUSES, value);
}

export function isReportingStatus(value: unknown): value is ReportingStatus {
  return hasValue(REPORTING_STATUSES, value);
}

export function isKnownProviderId(value: unknown): value is ProviderId {
  return hasValue(PROVIDER_IDS, value);
}

export function isKnownEnvironmentId(value: unknown): value is EnvironmentId {
  return hasValue(ENVIRONMENT_IDS, value);
}

export function isPositionSide(value: unknown): value is PositionSide {
  return hasValue(POSITION_SIDES, value);
}

export function isSignalDirection(value: unknown): value is SignalDirection {
  return hasValue(SIGNAL_DIRECTIONS, value);
}

export function isExchangeOrderSide(value: unknown): value is ExchangeOrderSide {
  return hasValue(EXCHANGE_ORDER_SIDES, value);
}

export function requireRuntimeStatus<T extends string>(
  value: T | null | undefined,
  fieldName: string,
  isValid: (value: unknown) => value is T,
): T {
  if (value == null || value === '') throw new Error(`missing_runtime_status:${fieldName}`);
  if (!isValid(value)) throw new Error(`invalid_runtime_status:${fieldName}:${value}`);
  return value;
}

export function validateRuntimeStatusContract(contract: Partial<RuntimeStatusContract>): RuntimeStatusContract {
  return {
    trade_lifecycle_state: requireRuntimeStatus(contract.trade_lifecycle_state, 'trade_lifecycle_state', isTradeLifecycleState),
    execution_status: requireRuntimeStatus(contract.execution_status, 'execution_status', isExecutionStatus),
    protection_status: requireRuntimeStatus(contract.protection_status, 'protection_status', isProtectionStatus),
    monitoring_status: requireRuntimeStatus(contract.monitoring_status, 'monitoring_status', isMonitoringStatus),
    recovery_status: requireRuntimeStatus(contract.recovery_status, 'recovery_status', isRecoveryStatus),
    reporting_status: requireRuntimeStatus(contract.reporting_status, 'reporting_status', isReportingStatus),
  };
}
