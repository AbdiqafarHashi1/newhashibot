"""Local, demo research intelligence; no order or cloud side effects."""
from .contracts import (VERSION, Candle, IntelligenceConfig, Tick,
                        candle_from_mt5, tick_from_mt5)
from .intelligence import MarketIntelligence, estimate_cost
from .micro import MICRO_ID, MicroConfig, MicroScalper
from .momentum import MOMENTUM_ID, MomentumConfig, MomentumScalper
from .range_scalper import RANGE_ID, RangeConfig, RangeScalper
from .trend import TREND_ID, TrendConfig, TrendScalper
from .strategy_contracts import ExecutionCosts, EntryPlan, StrategyDecision
from .management import PositionObservation, ManagementDecision, manage_position
from .basket_strategy import BASKET_ID, BasketEntryConfig, BasketScalper
from .basket import BasketBook, BasketEnvelope, BasketConfig, BrokerFacts

__all__ = ['VERSION', 'Candle', 'IntelligenceConfig', 'Tick',
           'candle_from_mt5', 'tick_from_mt5', 'MarketIntelligence', 'estimate_cost',
           'MICRO_ID', 'MicroConfig', 'MicroScalper', 'MOMENTUM_ID', 'MomentumConfig',
           'MomentumScalper', 'ExecutionCosts', 'EntryPlan', 'StrategyDecision',
           'PositionObservation', 'ManagementDecision', 'manage_position',
           'RANGE_ID', 'RangeConfig', 'RangeScalper', 'TREND_ID', 'TrendConfig', 'TrendScalper',
           'BASKET_ID', 'BasketEntryConfig', 'BasketScalper', 'BasketBook', 'BasketEnvelope',
           'BasketConfig', 'BrokerFacts']
