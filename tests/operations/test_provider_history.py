"""Actual MT5 history adapter with an injected terminal, no provider connection."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path
from datetime import timezone

class ProviderHistoryTests(unittest.TestCase):
    def setUp(self):
        self.saved = {key: sys.modules.get(key) for key in ('logging_config', 'MetaTrader5')}
        logs = types.ModuleType('logging_config'); logs.logger = types.SimpleNamespace(warning=lambda *_: None)
        sys.modules['logging_config'] = logs
        terminal = types.ModuleType('MetaTrader5'); self.ranges = []
        self.deal = types.SimpleNamespace(ticket=1, order=2, symbol='EURUSD', type=0, volume=.1, price=1.1, profit=-1, commission=-.2, swap=-.3, fee=-.1, entry=1, position_id=3, time=100)
        terminal.history_deals_get = lambda lo, hi: (self.ranges.append((lo, hi)) or [self.deal])
        sys.modules['MetaTrader5'] = terminal; self.terminal = terminal
        spec = importlib.util.spec_from_file_location('history_mt5_client', Path('mt5-agent/mt5_client.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        self.client = module.MT5Client.__new__(module.MT5Client); self.client.check_connection = lambda: True
    def tearDown(self):
        for key, value in self.saved.items():
            if value is None: sys.modules.pop(key, None)
            else: sys.modules[key] = value
    def test_history_includes_position_and_all_costs_with_exact_utc_coverage(self):
        rows = self.client.get_history()
        self.assertEqual(rows[0]['position_id'], '3')
        self.assertEqual(rows[0]['entry'], 1)
        self.assertEqual(sum(rows[0][key] for key in ('profit', 'commission', 'swap', 'fee')), -1.6)
        self.assertEqual(self.ranges[0][0].tzinfo, timezone.utc)
        self.assertEqual(self.client.last_history_range['to'], self.ranges[0][1].isoformat())
    def test_failed_read_or_disconnect_clears_previous_coverage(self):
        self.client.get_history(); self.terminal.history_deals_get = lambda *_: None
        self.assertIsNone(self.client.get_history()); self.assertIsNone(self.client.last_history_range)
        self.client.last_history_range = {'from': 'old'}; self.client.check_connection = lambda: False
        self.assertIsNone(self.client.get_history()); self.assertIsNone(self.client.last_history_range)
    def test_unknown_positions_and_orders_are_not_flat_accounts(self):
        self.terminal.positions_get = lambda: None
        self.terminal.orders_get = lambda: None
        with self.assertRaisesRegex(RuntimeError, 'POSITIONS_UNAVAILABLE'): self.client.get_positions()
        with self.assertRaisesRegex(RuntimeError, 'ORDERS_UNAVAILABLE'): self.client.get_orders()
        self.terminal.positions_get = lambda: ()
        self.terminal.orders_get = lambda: ()
        self.assertEqual(self.client.get_positions(), [])
        self.assertEqual(self.client.get_orders(), [])
        self.client.check_connection = lambda: False
        with self.assertRaisesRegex(RuntimeError, 'POSITIONS_UNAVAILABLE'): self.client.get_positions()
        with self.assertRaisesRegex(RuntimeError, 'ORDERS_UNAVAILABLE'): self.client.get_orders()
    def test_symbol_fills_and_currency_values_come_from_terminal(self):
        from datetime import datetime
        self.terminal.SYMBOL_TRADE_EXECUTION_MARKET = 2
        spec = types.SimpleNamespace(name='EURUSD',currency_base='EUR',currency_profit='USD',trade_tick_size=.00001,trade_tick_value=1,trade_mode=4,digits=5,point=.00001,trade_contract_size=100000,volume_min=.01,volume_max=100,volume_step=.01,trade_stops_level=0,bid=1.1,ask=1.1002,spread=20,filling_mode=3,trade_exemode=2)
        self.terminal.symbol_info = lambda symbol: spec
        self.terminal.symbol_select = lambda *_: True
        self.terminal.symbol_info_tick = lambda *_: types.SimpleNamespace(time=int(datetime.now(timezone.utc).timestamp()),bid=1.1,ask=1.1002)
        self.terminal.account_info = lambda: types.SimpleNamespace(currency='USD')
        result = self.client.get_symbol_info('EURUSD')
        self.assertEqual(result['fill_policies'], ['fok','ioc'])
        self.assertEqual(result['quote_to_account_conversion'],1)
        self.assertEqual(result['tick_value'],1)
        spec.filling_mode=0
        self.assertEqual(self.client.get_symbol_info('EURUSD')['fill_policies'],[])
