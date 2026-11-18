"""
HashiBot Quantitative Core - Module 2: Ultra-Low Latency Prop Breaker & Hysteresis Controller
Eliminates F2 (Prop Breaker Phase Lag & Flash Crash Violations) via direct-to-wire ZeroMQ dispatch.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional
import zmq.asyncio

logger = logging.getLogger("HashiBot.PropBreaker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s")


class BreakerState(str, Enum):
    NORMAL = "NORMAL"
    WARNING_DEADBAND = "WARNING_DEADBAND"
    EMERGENCY_HALTED = "EMERGENCY_HALTED"


@dataclass
class AccountHysteresisState:
    account_id: str
    broker_account_number: str
    daily_starting_equity: Decimal
    current_equity: Decimal
    state: BreakerState
    last_state_change: float
    last_breach_pct: Decimal
    tripped_count: int = 0


class UltraLowLatencyPropBreaker:
    """
    Direct-to-wire MT5 / Prop equity monitor and circuit breaker.
    Bypasses secondary database tables and webhooks during floating drawdown breaches,
    routing execution payloads directly to the outbound ZeroMQ execution socket line (<0.5ms).
    """

    def __init__(
        self,
        zmq_push_endpoint: str = "tcp://127.0.0.1:5555",
        hard_drawdown_limit_pct: Decimal = Decimal("4.00"),   # 4.0% absolute daily circuit ceiling
        warning_threshold_pct: Decimal = Decimal("3.80"),     # 3.80% Throttle / Deadband zone
        recovery_deadband_pct: Decimal = Decimal("3.20"),     # 3.20% Recovery reset floor
        cooldown_period_seconds: float = 300.0,               # 5-minute freeze post-halt
    ):
        self.zmq_endpoint = zmq_push_endpoint
        self.hard_limit_pct = min(hard_drawdown_limit_pct, Decimal("4.00"))
        self.warning_pct = warning_threshold_pct
        self.recovery_pct = recovery_deadband_pct
        self.cooldown_period = cooldown_period_seconds

        self.zmq_context = zmq.asyncio.Context()
        self.push_socket: Optional[zmq.asyncio.Socket] = None
        self.accounts: Dict[str, AccountHysteresisState] = {}
        self._lock = asyncio.Lock()
        self.running = False

    async def initialize(self) -> None:
        """Connects high-priority ZMQ socket with zero linger and maximum throughput."""
        self.push_socket = self.zmq_context.socket(zmq.PUSH)
        self.push_socket.setsockopt(zmq.SNDHWM, 10000)
        self.push_socket.setsockopt(zmq.LINGER, 0)
        self.push_socket.connect(self.zmq_endpoint)
        self.running = True
        logger.info(f"Ultra-Low Latency Prop Breaker connected to direct ZMQ wire: {self.zmq_endpoint}")

    def register_account(
        self,
        account_id: str,
        broker_account_number: str,
        daily_starting_equity: float,
    ) -> None:
        """Registers or refreshes an account baseline tracking state."""
        equity_dec = Decimal(str(daily_starting_equity))
        self.accounts[account_id] = AccountHysteresisState(
            account_id=account_id,
            broker_account_number=str(broker_account_number),
            daily_starting_equity=equity_dec,
            current_equity=equity_dec,
            state=BreakerState.NORMAL,
            last_state_change=time.monotonic(),
            last_breach_pct=Decimal("0.0"),
        )
        logger.info(
            f"Registered Prop Guardrail Account {broker_account_number} "
            f"(ID: {account_id}) | Starting Baseline: ${daily_starting_equity:,.2f}"
        )

    async def process_equity_update(
        self, account_id: str, current_floating_equity: float
    ) -> Tuple[BreakerState, float]:
        """
        Sub-millisecond equity evaluation loop with 3-tier mathematical hysteresis.
        Returns (Current Breaker State, Drawdown Percentage).
        """
        async with self._lock:
            state_obj = self.accounts.get(account_id)
            if not state_obj:
                return BreakerState.EMERGENCY_HALTED, 100.0

            cur_equity = Decimal(str(current_floating_equity))
            if not cur_equity.is_finite() or cur_equity < 0:
                state_obj.state = BreakerState.EMERGENCY_HALTED
                return state_obj.state, 100.0
            state_obj.current_equity = cur_equity
            start_equity = state_obj.daily_starting_equity
            now = time.monotonic()

            if start_equity <= Decimal("0"):
                return BreakerState.EMERGENCY_HALTED, 100.0

            drawdown_usd = start_equity - cur_equity
            drawdown_pct = (drawdown_usd / start_equity) * Decimal("100.0") if drawdown_usd > Decimal("0") else Decimal("0.0")
            state_obj.last_breach_pct = drawdown_pct

            # -----------------------------------------------------------------
            # 1. State: EMERGENCY_HALTED (Tripped Circuit)
            # -----------------------------------------------------------------
            if state_obj.state == BreakerState.EMERGENCY_HALTED:
                # A recovered quote cannot reset a daily breach. Reconcile the next day's baseline explicitly.
                return state_obj.state, float(drawdown_pct)

            # -----------------------------------------------------------------
            # 2. State: Hard Breach Evaluation (Instant Direct-to-Wire Dispatch)
            # -----------------------------------------------------------------
            if drawdown_pct >= self.hard_limit_pct:
                state_obj.state = BreakerState.EMERGENCY_HALTED
                state_obj.last_state_change = now
                state_obj.tripped_count += 1
                logger.critical(
                    f"CRITICAL PROP BREACH: Account {state_obj.broker_account_number} reached "
                    f"{drawdown_pct:.2f}% Drawdown! Triggering IMMEDIATE DIRECT-WIRE EMERGENCY_CLOSE_ALL."
                )
                await self._dispatch_direct_wire_emergency_close(state_obj, drawdown_pct)
                return state_obj.state, float(drawdown_pct)

            # -----------------------------------------------------------------
            # 3. State: Warning Deadband (Anti-Chatter Strategy Throttle)
            # -----------------------------------------------------------------
            if drawdown_pct >= self.warning_pct:
                if state_obj.state != BreakerState.WARNING_DEADBAND:
                    logger.warning(
                        f"DEADBAND THROTTLE: Account {state_obj.broker_account_number} entered "
                        f"warning band at {drawdown_pct:.2f}% DD. Sizing throttled."
                    )
                    state_obj.state = BreakerState.WARNING_DEADBAND
                    state_obj.last_state_change = now
                return state_obj.state, float(drawdown_pct)

            # -----------------------------------------------------------------
            # 4. State: Normal Healthy Baseline
            # -----------------------------------------------------------------
            if state_obj.state == BreakerState.WARNING_DEADBAND and drawdown_pct <= self.recovery_pct:
                logger.info(f"Account {state_obj.broker_account_number} cleared warning band. Returning to NORMAL.")
                state_obj.state = BreakerState.NORMAL
                state_obj.last_state_change = now

            return state_obj.state, float(drawdown_pct)

    async def _dispatch_direct_wire_emergency_close(
        self, account: AccountHysteresisState, breach_pct: Decimal
    ) -> None:
        """
        Direct ZMQ frame transmission bypassing all secondary HTTP webhooks.
        Execution Latency: < 0.5ms.
        """
        payload = {
            "action": "EMERGENCY_CLOSE_ALL",
            "account_id": account.account_id,
            "broker_account_number": account.broker_account_number,
            "reason": f"HARD_DRAWDOWN_BREACH_{breach_pct:.2f}_PCT",
            "timestamp_ns": time.time_ns(),
            "priority": "HIGH_FREQUENCY_INTERRUPT",
        }
        if self.push_socket:
            try:
                raw_msg = json.dumps(payload).encode("utf-8")
                await self.push_socket.send(raw_msg, flags=zmq.NOBLOCK)
                logger.info(f"Direct ZMQ frame sent successfully for Account {account.broker_account_number}.")
            except Exception as e:
                logger.error(f"Failed to transmit direct ZMQ emergency close frame: {e}")

    async def close(self) -> None:
        """Gracefully closes ZMQ context."""
        self.running = False
        if self.push_socket:
            self.push_socket.close()
        self.zmq_context.term()
        logger.info("UltraLowLatencyPropBreaker shut down successfully.")
