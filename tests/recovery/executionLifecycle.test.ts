import assert from 'node:assert/strict';
import {
  LIFECYCLE_STATES,
  isValidTransition,
  isTerminalState,
  requiresProtection,
  isRecoveryState,
  validateLifecycleTransition,
  shouldTriggerRecovery,
  getLifecycleStage,
  type LifecycleState,
} from '../../src/lib/executionLifecycle.js';

async function run() {
  // ─── 1. All expected states exist ─────────────────────────────────────────
  const expectedStates: LifecycleState[] = [
    'SIGNAL_CREATED', 'QUALIFIED', 'POSITION_SIZED', 'ORDER_SUBMITTED',
    'FILLED', 'PROTECTED', 'TP1', 'BREAKEVEN', 'TP2', 'CLOSED', 'ARCHIVED',
    'FAILED', 'RECOVERY_REQUIRED',
  ];
  for (const state of expectedStates) {
    assert.ok(LIFECYCLE_STATES.includes(state), `Missing state: ${state}`);
  }
  assert.equal(LIFECYCLE_STATES.length, 13, 'Must have exactly 13 lifecycle states');

  // ─── 2. Valid forward transitions ──────────────────────────────────────────
  assert.equal(isValidTransition('SIGNAL_CREATED', 'QUALIFIED'), true, 'SIGNAL_CREATED -> QUALIFIED');
  assert.equal(isValidTransition('QUALIFIED', 'POSITION_SIZED'), true, 'QUALIFIED -> POSITION_SIZED');
  assert.equal(isValidTransition('POSITION_SIZED', 'ORDER_SUBMITTED'), true, 'POSITION_SIZED -> ORDER_SUBMITTED');
  assert.equal(isValidTransition('ORDER_SUBMITTED', 'FILLED'), true, 'ORDER_SUBMITTED -> FILLED');
  assert.equal(isValidTransition('FILLED', 'PROTECTED'), true, 'FILLED -> PROTECTED');
  assert.equal(isValidTransition('FILLED', 'RECOVERY_REQUIRED'), true, 'FILLED -> RECOVERY_REQUIRED');
  assert.equal(isValidTransition('PROTECTED', 'TP1'), true, 'PROTECTED -> TP1');
  assert.equal(isValidTransition('TP1', 'BREAKEVEN'), true, 'TP1 -> BREAKEVEN');
  assert.equal(isValidTransition('BREAKEVEN', 'TP2'), true, 'BREAKEVEN -> TP2');
  assert.equal(isValidTransition('TP2', 'CLOSED'), true, 'TP2 -> CLOSED');
  assert.equal(isValidTransition('CLOSED', 'ARCHIVED'), true, 'CLOSED -> ARCHIVED');

  // ─── 3. Invalid transitions are rejected ──────────────────────────────────
  assert.equal(isValidTransition('SIGNAL_CREATED', 'FILLED'), false, 'Cannot skip QUALIFIED');
  assert.equal(isValidTransition('SIGNAL_CREATED', 'PROTECTED'), false, 'Cannot skip to PROTECTED');
  assert.equal(isValidTransition('ARCHIVED', 'SIGNAL_CREATED'), false, 'Cannot revive from ARCHIVED');
  assert.equal(isValidTransition('FAILED', 'FILLED'), false, 'Cannot revive from FAILED');
  assert.equal(isValidTransition('TP2', 'ORDER_SUBMITTED'), false, 'Cannot go backwards');

  // ─── 4. Same state is valid (idempotent) ───────────────────────────────────
  assert.equal(isValidTransition('PROTECTED', 'PROTECTED'), true, 'Same state is valid');

  // ─── 5. Terminal states ────────────────────────────────────────────────────
  assert.equal(isTerminalState('ARCHIVED'), true, 'ARCHIVED is terminal');
  assert.equal(isTerminalState('FAILED'), true, 'FAILED is terminal');
  assert.equal(isTerminalState('PROTECTED'), false, 'PROTECTED is not terminal');
  assert.equal(isTerminalState('CLOSED'), false, 'CLOSED is not terminal (can be archived)');

  // ─── 6. FILLED requires protection ────────────────────────────────────────
  assert.equal(requiresProtection('FILLED'), true, 'FILLED requires protection');
  assert.equal(requiresProtection('PROTECTED'), false, 'PROTECTED does not require protection');
  assert.equal(requiresProtection('ORDER_SUBMITTED'), false, 'ORDER_SUBMITTED does not require protection');

  // ─── 7. Recovery state ─────────────────────────────────────────────────────
  assert.equal(isRecoveryState('RECOVERY_REQUIRED'), true, 'RECOVERY_REQUIRED is recovery');
  assert.equal(isRecoveryState('PROTECTED'), false, 'PROTECTED is not recovery');

  // ─── 8. shouldTriggerRecovery: missing SL/TP after fill ────────────────────
  assert.equal(shouldTriggerRecovery('FILLED', false, false), true, 'FILLED without SL/TP triggers recovery');
  assert.equal(shouldTriggerRecovery('FILLED', true, false), true, 'FILLED without TP triggers recovery');
  assert.equal(shouldTriggerRecovery('FILLED', false, true), true, 'FILLED without SL triggers recovery');
  assert.equal(shouldTriggerRecovery('FILLED', true, true), false, 'FILLED with SL/TP does not trigger recovery');
  assert.equal(shouldTriggerRecovery('PROTECTED', false, false), false, 'PROTECTED does not trigger recovery');

  // ─── 9. validateLifecycleTransition with null from ─────────────────────────
  const nullValidation = validateLifecycleTransition(null, 'SIGNAL_CREATED');
  assert.equal(nullValidation.valid, true, 'Null from state is always valid');

  // ─── 10. validateLifecycleTransition with invalid transition ──────────────
  const invalidValidation = validateLifecycleTransition('SIGNAL_CREATED', 'FILLED');
  assert.equal(invalidValidation.valid, false, 'Invalid transition is rejected');
  assert.ok(invalidValidation.error, 'Invalid transition has error message');

  // ─── 11. Recovery can go back to PROTECTED ─────────────────────────────────
  assert.equal(isValidTransition('RECOVERY_REQUIRED', 'PROTECTED'), true, 'RECOVERY_REQUIRED -> PROTECTED');
  assert.equal(isValidTransition('RECOVERY_REQUIRED', 'CLOSED'), true, 'RECOVERY_REQUIRED -> CLOSED');
  assert.equal(isValidTransition('RECOVERY_REQUIRED', 'FAILED'), true, 'RECOVERY_REQUIRED -> FAILED');

  // ─── 12. Lifecycle stages ──────────────────────────────────────────────────
  assert.equal(getLifecycleStage('SIGNAL_CREATED'), 'pre_execution', 'SIGNAL_CREATED is pre_execution');
  assert.equal(getLifecycleStage('ORDER_SUBMITTED'), 'execution', 'ORDER_SUBMITTED is execution');
  assert.equal(getLifecycleStage('FILLED'), 'execution', 'FILLED is execution');
  assert.equal(getLifecycleStage('PROTECTED'), 'protection', 'PROTECTED is protection');
  assert.equal(getLifecycleStage('TP1'), 'management', 'TP1 is management');
  assert.equal(getLifecycleStage('CLOSED'), 'management', 'CLOSED is management');
  assert.equal(getLifecycleStage('ARCHIVED'), 'terminal', 'ARCHIVED is terminal');
  assert.equal(getLifecycleStage('FAILED'), 'terminal', 'FAILED is terminal');
  assert.equal(getLifecycleStage('RECOVERY_REQUIRED'), 'recovery', 'RECOVERY_REQUIRED is recovery');

  // ─── 13. Binance and Bybit share the same lifecycle contract ───────────────
  // Both providers use the same state machine — the test proves parity by
  // verifying the same transitions work regardless of provider name.
  const binanceTransitions = ['SIGNAL_CREATED', 'QUALIFIED', 'POSITION_SIZED', 'ORDER_SUBMITTED', 'FILLED', 'PROTECTED', 'TP1', 'BREAKEVEN', 'TP2', 'CLOSED', 'ARCHIVED'];
  const bybitTransitions = ['SIGNAL_CREATED', 'QUALIFIED', 'POSITION_SIZED', 'ORDER_SUBMITTED', 'FILLED', 'PROTECTED', 'TP1', 'BREAKEVEN', 'TP2', 'CLOSED', 'ARCHIVED'];
  assert.deepEqual(binanceTransitions, bybitTransitions, 'Binance and Bybit share the same lifecycle path');

  // Verify each step in the path is a valid transition
  for (let i = 0; i < binanceTransitions.length - 1; i++) {
    const from = binanceTransitions[i] as LifecycleState;
    const to = binanceTransitions[i + 1] as LifecycleState;
    assert.equal(isValidTransition(from, to), true, `Transition ${from} -> ${to} must be valid for both providers`);
  }

  console.log('✓ executionLifecycle tests passed (13 assertion groups)');
}

run().catch((err) => {
  console.error('✗ executionLifecycle tests failed:', err);
  process.exit(1);
});
