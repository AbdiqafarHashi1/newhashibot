import {
  type ExecutionStatus,
  type ExchangeOrderSide,
  type PositionSide,
  type ProtectionStatus,
  type SignalDirection,
} from './types.js';
import { isExecutionStatus, isProtectionStatus, isExchangeOrderSide, isPositionSide, isSignalDirection } from './validation.js';

/** @deprecated Use PositionSide. Kept for Phase 2A compatibility. */
export type LegacyDirection = 'buy' | 'sell' | 'long' | 'short' | 'BUY' | 'SELL' | string;

/** @deprecated Use ExecutionStatus. Kept for Phase 2A compatibility. */
export type LegacyExecutionStatus = string;

/** @deprecated Use ProtectionStatus. Kept for Phase 2A compatibility. */
export type LegacyProtectionStatus = string;

export const LEGACY_EXECUTION_STATUS_MAP: Record<string, ExecutionStatus> = {
  pending: 'created',
  entry_submitted: 'submitted',
  submitted: 'submitted',
  entry_accepted: 'accepted',
  accepted: 'accepted',
  entry_filled: 'filled',
  filled: 'filled',
  partially_filled: 'partially_filled',
  partially_closed: 'partially_filled',
  protected: 'filled',
  protected_native: 'filled',
  protected_managed: 'filled',
  pending_protection: 'filled',
  protection_pending: 'filled',
  protection_failed: 'filled',
  recovery_required: 'filled',
  closed: 'filled',
  closed_tp: 'filled',
  closed_tp2: 'filled',
  closed_profit_lock: 'filled',
  closed_sl: 'filled',
  closed_breakeven: 'filled',
  closed_manual: 'filled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  entry_timeout_cancelled: 'cancelled',
  entry_missing_no_position: 'expired',
  closed_expired: 'expired',
  closed_expired_after_tp1: 'expired',
  rejected: 'rejected',
  failed: 'failed',
  skipped: 'failed',
};

export const LEGACY_PROTECTION_STATUS_MAP: Record<string, ProtectionStatus> = {
  protected: 'verified',
  protected_native: 'verified',
  protected_managed: 'verified',
  pending_protection: 'pending',
  protection_pending: 'pending',
  pending_managed_protection: 'pending',
  partially_protected: 'partially_protected',
  missing_sl: 'missing_sl',
  missing_tp: 'missing_tp',
  missing_sl_tp: 'missing_sl_tp',
  protection_failed: 'failed',
  unprotected: 'failed',
  unprotected_failed: 'failed',
  protection_recovered: 'verified',
  repair_requested: 'repair_requested',
  repairing: 'repairing',
  closed: 'not_required',
};

export function toPositionSide(value: LegacyDirection): PositionSide | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (isPositionSide(normalized)) return normalized;
  if (normalized === 'buy') return 'long';
  if (normalized === 'sell') return 'short';
  return null;
}

export function toSignalDirection(value: LegacyDirection): SignalDirection | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (isSignalDirection(normalized)) return normalized;
  if (normalized === 'long') return 'buy';
  if (normalized === 'short') return 'sell';
  return null;
}

export function toExchangeOrderSide(value: LegacyDirection): ExchangeOrderSide | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (isExchangeOrderSide(normalized)) return normalized;
  if (normalized === 'LONG' || normalized === 'BUY') return 'BUY';
  if (normalized === 'SHORT' || normalized === 'SELL') return 'SELL';
  return null;
}

export function closeExchangeOrderSideForPosition(side: PositionSide): ExchangeOrderSide {
  return side === 'long' ? 'SELL' : 'BUY';
}

export function positionSideFromSignalDirection(direction: SignalDirection): PositionSide {
  return direction === 'buy' ? 'long' : 'short';
}

export function signalDirectionFromPositionSide(side: PositionSide): SignalDirection {
  return side === 'long' ? 'buy' : 'sell';
}

export function normalizeExecutionStatus(value: LegacyExecutionStatus | null | undefined): ExecutionStatus | null {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (isExecutionStatus(normalized)) return normalized;
  return LEGACY_EXECUTION_STATUS_MAP[normalized] ?? null;
}

export function normalizeProtectionStatus(value: LegacyProtectionStatus | null | undefined): ProtectionStatus | null {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (isProtectionStatus(normalized)) return normalized;
  return LEGACY_PROTECTION_STATUS_MAP[normalized] ?? null;
}
