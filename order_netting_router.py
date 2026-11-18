"""
HashiBot Quantitative Core - Module 4: Order-Netting & Anti-Cannibalization Router
Eliminates F5 (Unchecked Opposing Deltas & Churn on Zero Net Delta).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional, Tuple

import redis.asyncio as aioredis

from pre_trade_risk_gateway import OrderIntent, OrderSide, PreTradeRiskGateway

logger = logging.getLogger("HashiBot.OrderNettingRouter")


class NettingAction(str, Enum):
    EXECUTE_CLEAN = "EXECUTE_CLEAN"
    PARTIAL_INTERNAL_NET = "PARTIAL_INTERNAL_NET"
    FULL_INTERNAL_NET = "FULL_INTERNAL_NET"
    BLOCKED_OPPOSING_CHURN = "BLOCKED_OPPOSING_CHURN"


@dataclass
class NettingResult:
    action: NettingAction
    outbound_size: float
    netted_size: float
    reason: str


class OrderNettingRouter:
    """
    Intercepts pre-execution trades, evaluates global multi-strategy exposure
    for the same underlying symbol, and nets out opposing deltas to eliminate
    unnecessary spread and commission bleed.
    """

    POSITIONS_HASH_KEY = "hashibot:global:open_deltas"
    NETTING_LOCK = "hashibot:lock:netting_router"

    def __init__(self, redis_client: aioredis.Redis, risk_gateway: PreTradeRiskGateway):
        self.redis = redis_client
        self.risk_gateway = risk_gateway

    async def route_order_intent(self, intent: OrderIntent) -> Tuple[bool, NettingResult]:
        """
        Coordinates Netting Check -> Pre-Trade Risk Gateway -> Exchange Execution Dispatch.
        """
        lock = self.redis.lock(f"{self.NETTING_LOCK}:{intent.provider}:{intent.account_id}", timeout=1.0, blocking_timeout=1.5)

        async with lock:
            # 1. Fetch current aggregate open delta for symbol across all strategies
            current_delta_raw = await self.redis.hget(f'{self.POSITIONS_HASH_KEY}:{intent.provider}:{intent.account_id}', intent.symbol)
            current_delta = float(current_delta_raw or 0.0)  # Positive = Long, Negative = Short

            intent_delta = intent.size if intent.side == OrderSide.BUY else -intent.size
            netting_result = self._calculate_netting(current_delta, intent_delta, intent.size)

            if netting_result.action == NettingAction.BLOCKED_OPPOSING_CHURN:
                logger.warning(
                    f"ORDER BLOCKED by Netting Router: {intent.strategy_id} tried to {intent.side.value} "
                    f"{intent.size} {intent.symbol}, which strictly opposes active portfolio delta "
                    f"({current_delta:+.2f}). Commission churn prevented."
                )
                return False, netting_result

            # Opposing exposure requires a confirmed broker reduction; Redis netting cannot close a trade.
            if netting_result.outbound_size != intent.size:
                return False, netting_result

            # 2. Adjust intent size if partially netted internally
            adjusted_intent = intent
            if netting_result.outbound_size != intent.size:
                adjusted_intent = OrderIntent(
                    order_id=intent.order_id,
                    strategy_id=intent.strategy_id,
                    symbol=intent.symbol,
                    asset_class=intent.asset_class,
                    side=intent.side,
                    size=netting_result.outbound_size,
                    estimated_price=intent.estimated_price,
                    stop_loss_price=intent.stop_loss_price,
                    account_id=intent.account_id,
                    provider=intent.provider,
                    garman_klass_vol=intent.garman_klass_vol,
                )

            # If completely absorbed internally, bypass exchange dispatch entirely
            if netting_result.outbound_size <= 0.0:
                logger.info(
                    f"ORDER ABSORBED INTERNALLY: {intent.strategy_id} {intent.side.value} {intent.size} "
                    f"{intent.symbol} netted against opposing position. Zero exchange fees paid."
                )
                new_delta = current_delta + intent_delta
                await self.redis.hset(f'{self.POSITIONS_HASH_KEY}:{intent.provider}:{intent.account_id}', intent.symbol, str(new_delta))
                return True, netting_result

            # 3. Synchronously pass through Pre-Trade Risk Gateway
            risk_result = await self.risk_gateway.evaluate_and_reserve(adjusted_intent)
            if not risk_result.approved:
                logger.error(f"Order {intent.order_id} failed risk gateway: {risk_result.reason}")
                return False, netting_result

            # Confirmed provider fills, not accepted intents, own exposure updates.

            return True, netting_result

    def _calculate_netting(
        self, current_delta: float, intent_delta: float, original_size: float
    ) -> NettingResult:
        """
        Determines if an order cancels existing exposure or creates fresh directional risk.
        """
        # Case A: Same direction or clean start -> No netting, execute full size
        if (current_delta >= 0 and intent_delta > 0) or (current_delta <= 0 and intent_delta < 0):
            return NettingResult(
                action=NettingAction.EXECUTE_CLEAN,
                outbound_size=original_size,
                netted_size=0.0,
                reason="ORDER_EXPANDS_EXISTING_OR_ZERO_DELTA",
            )

        # Case B: Opposing Direction -> Evaluate offset potential
        abs_current = abs(current_delta)
        abs_intent = abs(intent_delta)

        if abs_intent <= abs_current:
            # Fully absorbed by existing opposing position
            return NettingResult(
                action=NettingAction.FULL_INTERNAL_NET,
                outbound_size=0.0,
                netted_size=original_size,
                reason="ORDER_100_PERCENT_NETTED_INTERNALLY",
            )
        else:
            # Partially absorbed, execute residual to exchange
            residual_outbound = abs_intent - abs_current
            return NettingResult(
                action=NettingAction.PARTIAL_INTERNAL_NET,
                outbound_size=residual_outbound,
                netted_size=abs_current,
                reason=f"PARTIALLY_NETTED (Residual={residual_outbound:.4f})",
            )
