"""
HashiBot Quantitative Core - Module 2: Microstructure Volatility & Hysteresis Engine
Eliminates F1 (Classification Lag) and F3 (Threshold Flickering).
"""

from __future__ import annotations

import asyncio
import logging
import math
from collections import deque
from dataclasses import dataclass
from enum import Enum
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np
import redis.asyncio as aioredis

logger = logging.getLogger("HashiBot.MicrostructureArbitrator")


class StrategyMode(str, Enum):
    TREND = "TREND"
    GRID = "GRID"
    SUSPENDED = "SUSPENDED"


@dataclass
class CandleStick:
    open: float
    high: float
    low: float
    close: float
    volume: float
    timestamp_ms: int


@dataclass
class OrderBookDepth:
    bids: List[Tuple[float, float]]  # [(price, size), ...] up to 3 levels
    asks: List[Tuple[float, float]]  # [(price, size), ...] up to 3 levels
    timestamp_ms: int


class MicrostructureArbitrator:
    """
    Computes zero-lag Garman-Klass Volatility, Level-3 Order Book Imbalance (OBI),
    and enforces a Hysteresis Schmitt Trigger state machine.
    """

    def __init__(
        self,
        redis_client: aioredis.Redis,
        symbol: str,
        gk_window_size: int = 14,
        gk_spike_threshold: float = 0.00045,  # Parameterized for intraday asset volatility
        obi_imbalance_threshold: float = 0.85,
        schmitt_alpha: float = 75.0,  # Upper boundary to activate TREND
        schmitt_beta: float = 40.0,   # Lower boundary to switch to GRID
    ):
        self.redis = redis_client
        self.symbol = symbol
        self.gk_window_size = gk_window_size
        self.gk_spike_threshold = gk_spike_threshold
        self.obi_threshold = obi_imbalance_threshold
        self.alpha = schmitt_alpha
        self.beta = schmitt_beta

        self.candle_buffer: Deque[CandleStick] = deque(maxlen=gk_window_size)
        self.current_state: StrategyMode = StrategyMode.GRID
        self.mean_reversion_suspended: bool = False

    def add_candle(self, candle: CandleStick) -> None:
        self.candle_buffer.append(candle)

    def calculate_garman_klass_volatility(self) -> float:
        """
        Computes Garman-Klass Volatility:
        sigma^2 = (1/N) * sum [ 0.5 * (ln(H/L))^2 - (2*ln(2) - 1) * (ln(C/O))^2 ]
        """
        n = len(self.candle_buffer)
        if n < self.gk_window_size:
            return 0.0

        gk_constant = 2.0 * math.log(2.0) - 1.0  # Approx 0.386294
        sum_terms = 0.0

        for c in self.candle_buffer:
            if c.low <= 0 or c.open <= 0:
                continue
            log_hl = math.log(c.high / c.low)
            log_co = math.log(c.close / c.open)
            term = 0.5 * (log_hl**2) - (gk_constant * (log_co**2))
            sum_terms += term

        variance = sum_terms / float(n)
        return max(0.0, variance)

    def calculate_order_book_imbalance(self, depth: OrderBookDepth) -> float:
        """
        Computes 3-level Order Book Imbalance:
        OBI = (V_bid - V_ask) / (V_bid + V_ask)
        """
        bid_vol = sum(size for _, size in depth.bids[:3])
        ask_vol = sum(size for _, size in depth.asks[:3])
        total_vol = bid_vol + ask_vol

        if total_vol == 0:
            return 0.0

        obi = (bid_vol - ask_vol) / total_vol
        return float(np.clip(obi, -1.0, 1.0))

    async def update_microstructure(
        self,
        latest_candle: CandleStick,
        depth: OrderBookDepth,
        raw_strategy_score: float,
    ) -> Tuple[StrategyMode, bool]:
        """
        Processes new tick/candle data, evaluates thresholds, and updates regime state.
        """
        self.add_candle(latest_candle)

        gk_vol = self.calculate_garman_klass_volatility()
        obi = self.calculate_order_book_imbalance(depth)

        # Microstructure Shock Condition Check
        volatility_spike = gk_vol > self.gk_spike_threshold
        liquidity_vacuum = abs(obi) > self.obi_threshold

        if volatility_spike and liquidity_vacuum:
            if not self.mean_reversion_suspended:
                self.mean_reversion_suspended = True
                logger.critical(
                    f"MICROSTRUCTURE SHOCK DETECTED on {self.symbol}! "
                    f"GK_Vol={gk_vol:.6f} > {self.gk_spike_threshold}, |OBI|={abs(obi):.2f} > {self.obi_threshold}. "
                    f"ISSUING IMMEDIATE OVERRIDE: SUSPEND_MEAN_REVERSION."
                )
                await self.redis.set(
                    f"hashibot:override:{self.symbol}:suspend_mean_reversion",
                    "1",
                    ex=120,  # 2-minute emergency circuit breaker
                )
        else:
            # Auto-reset suspension if conditions normalize
            if self.mean_reversion_suspended and not volatility_spike and not liquidity_vacuum:
                self.mean_reversion_suspended = False
                await self.redis.delete(f"hashibot:override:{self.symbol}:suspend_mean_reversion")
                logger.info(f"Microstructure normalized on {self.symbol}. Mean-reversion unlocked.")

        # Hysteresis Schmitt Trigger Evaluation
        if self.mean_reversion_suspended:
            new_state = StrategyMode.TREND
        else:
            new_state = self._evaluate_schmitt_trigger(raw_strategy_score)

        self.current_state = new_state

        # Publish state to Redis
        await self.redis.hset(
            f"hashibot:arbitrator:{self.symbol}",
            mapping={
                "current_mode": self.current_state.value,
                "gk_volatility": str(gk_vol),
                "obi": str(obi),
                "suspended_mr": str(int(self.mean_reversion_suspended)),
                "strategy_score": str(raw_strategy_score),
            },
        )

        return self.current_state, self.mean_reversion_suspended

    def _evaluate_schmitt_trigger(self, score: float) -> StrategyMode:
        """
        Strict Schmitt Trigger state transition:
        If S_t > alpha -> TREND
        If S_t < beta  -> GRID
        Else -> State_{t-1}
        """
        if score > self.alpha:
            return StrategyMode.TREND
        elif score < self.beta:
            return StrategyMode.GRID
        else:
            return self.current_state  # Preserves previous state inside the [beta, alpha] deadband
