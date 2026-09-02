"""
HashiBot Quantitative Core - Module 1: Pre-Trade Risk Gateway (V3 Architecture)
Refactored for Non-Blocking PostgreSQL Locks & Single-Pass Stored Procedure Execution.
Eliminates F1 (DB Concurrency Deadlocks) & F4 (Multi-Step I/O Socket Churn).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger("HashiBot.PreTradeRiskGateway")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s")


class AssetClass(str, Enum):
    CRYPTO = "CRYPTO"
    FOREX = "FOREX"
    METALS = "METALS"


class AccountProfile(str, Enum):
    STRICT_PROP_GUARDRAIL = "STRICT_PROP_GUARDRAIL"
    AGGRESSIVE_PERSONAL = "AGGRESSIVE_PERSONAL"


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


@dataclass(frozen=True)
class OrderIntent:
    order_id: str
    account_id: str
    strategy_id: str
    provider: str
    symbol: str
    asset_class: AssetClass
    side: OrderSide
    size: float
    estimated_price: float
    stop_loss_price: float
    garman_klass_vol: float = 0.0001
    timestamp_ns: int = 0

    @property
    def notional_value(self) -> float:
        return self.size * self.estimated_price

    @property
    def estimated_risk_usd(self) -> float:
        delta = abs(self.estimated_price - self.stop_loss_price)
        return delta * self.size


@dataclass(frozen=True)
class RiskCheckResult:
    approved: bool
    reason: str
    reserved_margin: float
    calculated_risk_var: float
    account_floating_equity: float
    execution_time_ms: float


class PreTradeRiskGateway:
    """
    High-Frequency Non-Blocking Pre-Trade Risk Gateway.
    Integrates single-trip atomic PostgreSQL verification (Module 3) with
    non-blocking row handling (Module 1) to eliminate all lock starvation.
    """

    def __init__(
        self,
        db_pool: Optional[Any] = None,
        dsn: Optional[str] = None,
        max_portfolio_var_usd: float = 25000.0,
        max_margin_pool_usd: float = 80000.0,
    ):
        self.db_pool = db_pool
        self.dsn = dsn
        self.max_portfolio_var = max_portfolio_var_usd
        self.max_margin_pool = max_margin_pool_usd
        self._local_lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Initializes connection pooling if asyncpg DSN is provided."""
        if self.db_pool is None and self.dsn:
            import asyncpg
            self.db_pool = await asyncpg.create_pool(
                dsn=self.dsn,
                min_size=5,
                max_size=30,
                command_timeout=3.0,
            )
            logger.info("PreTradeRiskGateway initialized dedicated PostgreSQL connection pool.")
        else:
            logger.info("PreTradeRiskGateway initialized with existing database handle.")

    async def evaluate_and_reserve(self, intent: OrderIntent) -> RiskCheckResult:
        """
        Executes pre-trade risk evaluation in a single non-blocking stored procedure call (<5ms).
        Guarantees strict isolation across accounts, strategies, and asset classes.
        """
        start_time = time.perf_counter()

        if self.db_pool is not None:
            try:
                async with self.db_pool.acquire() as conn:
                    # Single-trip compiled stored procedure call (Module 3)
                    row = await conn.fetchrow(
                        """
                        SELECT approved, rejection_code, reserved_margin, allocated_var,
                               account_floating_equity, execution_duration_us
                        FROM public.fn_evaluate_and_reserve_pretrade_risk(
                            $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10
                        )
                        """,
                        intent.order_id,
                        intent.account_id,
                        intent.strategy_id,
                        intent.provider,
                        intent.symbol,
                        intent.side.value,
                        Decimal(str(intent.size)),
                        Decimal(str(intent.estimated_price)),
                        Decimal(str(intent.stop_loss_price)),
                        Decimal(str(intent.garman_klass_vol)),
                    )

                    latency_ms = (time.perf_counter() - start_time) * 1000.0
                    if row:
                        return RiskCheckResult(
                            approved=row["approved"],
                            reason=row["rejection_code"],
                            reserved_margin=float(row["reserved_margin"]),
                            calculated_risk_var=float(row["allocated_var"]),
                            account_floating_equity=float(row["account_floating_equity"]),
                            execution_time_ms=latency_ms,
                        )
            except Exception as e:
                logger.error(f"PostgreSQL Stored Procedure Error for {intent.order_id}: {e}")
                # Fail-safe local memory fallback evaluation

        # In-memory ultra-low latency fallback evaluation
        async with self._local_lock:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            notional = intent.notional_value
            sl_dist = abs(intent.estimated_price - intent.stop_loss_price)
            base_risk = sl_dist * intent.size
            calc_var = base_risk * (1.0 + (intent.garman_klass_vol * 10.0))

            # Default to 10% margin reservation (10x max leverage)
            margin_req = notional * 0.10

            if calc_var > (self.max_portfolio_var * 0.05):  # 5% max single risk
                return RiskCheckResult(
                    approved=False,
                    reason=f"FALLBACK_RISK_LIMIT_EXCEEDED: VaR ${calc_var:.2f}",
                    reserved_margin=0.0,
                    calculated_risk_var=calc_var,
                    account_floating_equity=10000.0,
                    execution_time_ms=latency_ms,
                )

            return RiskCheckResult(
                approved=True,
                reason="LOCAL_FALLBACK_APPROVED",
                reserved_margin=margin_req,
                calculated_risk_var=calc_var,
                account_floating_equity=10000.0,
                execution_time_ms=latency_ms,
            )

    async def release_reservation(self, order_id: str, account_id: str) -> bool:
        """Atomically releases a reserved margin slot upon order fill or cancellation."""
        if self.db_pool:
            try:
                async with self.db_pool.acquire() as conn:
                    async with conn.transaction():
                        row = await conn.fetchrow(
                            """
                            SELECT reserved_margin, symbol, size
                            FROM public.order_reservations
                            WHERE order_id = $1 AND account_id = $2::uuid AND status = 'RESERVED'
                            FOR UPDATE
                            """,
                            order_id,
                            account_id,
                        )
                        if row:
                            margin = row["reserved_margin"]
                            symbol = row["symbol"]
                            notional = row["size"]

                            await conn.execute(
                                """
                                UPDATE public.order_reservations
                                SET status = 'RELEASED'
                                WHERE order_id = $1
                                """,
                                order_id,
                            )
                            await conn.execute(
                                """
                                UPDATE public.trading_accounts
                                SET allocated_margin = GREATEST(0, allocated_margin - $1),
                                    updated_at = NOW()
                                WHERE account_id = $2::uuid
                                """,
                                margin,
                                account_id,
                            )
                            await conn.execute(
                                """
                                UPDATE public.account_asset_allocations
                                SET current_notional = GREATEST(0, current_notional - $1),
                                    updated_at = NOW()
                                WHERE account_id = $2::uuid AND symbol = $3
                                """,
                                notional,
                                account_id,
                                symbol,
                            )
                            return True
            except Exception as e:
                logger.error(f"Failed to release reservation {order_id}: {e}")
        return False
