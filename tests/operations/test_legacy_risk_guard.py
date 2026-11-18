import asyncio
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

class LegacyRiskGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_or_failed_database_cannot_approve_synthetic_equity(self):
        module = load('legacy_gateway_fixture', 'pre_trade_risk_gateway.py')
        intent = module.OrderIntent('order', 'account', 'strategy', 'MT5_PROP', 'XAUUSD', module.AssetClass.METALS, module.OrderSide.BUY, 1, 100, 99)
        class FailedPool:
            def acquire(self):
                raise RuntimeError('database unavailable')
        for pool in [None, FailedPool()]:
            result = await module.PreTradeRiskGateway(db_pool=pool).evaluate_and_reserve(intent)
            self.assertFalse(result.approved)
            self.assertEqual(result.reason, 'ACCOUNT_RISK_AUTHORITY_UNAVAILABLE')
            self.assertEqual(result.account_floating_equity, 0)

    async def test_four_percent_breach_stays_latched_after_recovery(self):
        # The messaging SDK is replaced, not the real breaker logic or account state.
        sdk = types.ModuleType('zmq')
        sdk_async = types.ModuleType('zmq.asyncio')
        sdk_async.Context = lambda: types.SimpleNamespace(term=lambda: None)
        sdk.asyncio = sdk_async
        with patch.dict(sys.modules, {'zmq': sdk, 'zmq.asyncio': sdk_async}):
            module = load('legacy_breaker_fixture', 'margin_prop_breaker.py')
            breaker = module.UltraLowLatencyPropBreaker(cooldown_period_seconds=0)
            self.assertEqual((await breaker.process_equity_update('unknown', 10000))[0], module.BreakerState.EMERGENCY_HALTED)
            breaker.register_account('account', 'fixture', 10000)
            self.assertEqual((await breaker.process_equity_update('account', 9600))[0], module.BreakerState.EMERGENCY_HALTED)
            self.assertEqual((await breaker.process_equity_update('account', 10100))[0], module.BreakerState.EMERGENCY_HALTED)
            breaker.register_account('other', 'fixture2', 10000)
            self.assertEqual((await breaker.process_equity_update('other', float('nan')))[0], module.BreakerState.EMERGENCY_HALTED)
            await breaker.close()
