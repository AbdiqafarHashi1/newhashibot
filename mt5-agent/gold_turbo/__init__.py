"""Local, demo research intelligence; no order or cloud side effects."""
from .contracts import (VERSION, Candle, IntelligenceConfig, Tick,
                        candle_from_mt5, tick_from_mt5)
from .intelligence import MarketIntelligence, estimate_cost
from .micro import MICRO_ID, MicroConfig, MicroScalper
from .momentum import MOMENTUM_ID, MomentumConfig, MomentumScalper
from .strategy_contracts import ExecutionCosts, EntryPlan, StrategyDecision
from .management import PositionObservation, ManagementDecision, manage_position

__all__ = ['VERSION', 'Candle', 'IntelligenceConfig', 'Tick',
           'candle_from_mt5', 'tick_from_mt5', 'MarketIntelligence', 'estimate_cost',
           'MICRO_ID', 'MicroConfig', 'MicroScalper', 'MOMENTUM_ID', 'MomentumConfig',
           'MomentumScalper', 'ExecutionCosts', 'EntryPlan', 'StrategyDecision',
           'PositionObservation', 'ManagementDecision', 'manage_position']
