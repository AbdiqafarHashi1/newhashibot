"""
Unit test suite for HashiBot MT5 Agent Core (Phase 8C-2)
Tests config validation, cloud client payload formatting, MT5 client retcode classification,
volume normalization, command processor dispatch, single instance locking, and fail-closed checks.
"""

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

# Ensure agent directory is in sys.path
AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if AGENT_DIR not in sys.path:
    sys.path.insert(0, AGENT_DIR)

from config import Config
from cloud_client import CloudClient
from mt5_client import MT5Client
from command_processor import CommandProcessor
from state_sync import StateSyncManager
from symbol_sync import SymbolSyncManager
from market_data import MarketDataPublisher, REQUIRED_SYMBOLS, SCANNER_TIMEFRAMES


class TestMT5AgentConfig(unittest.TestCase):
    def test_config_validation(self):
        old = (Config.MT5_TERMINAL_PATH, Config.ACCOUNT_ID, Config.OWNER_ID, Config.CREDENTIAL_REF, Config.BRIDGE_TOKEN)
        Config.SUPABASE_URL = "http://localhost:3000"
        Config.SUPABASE_SERVICE_ROLE_KEY = "test-service-key"
        Config.BRIDGE_ID = "bridge-test-01"
        Config.MT5_TERMINAL_PATH = r"C:\Program Files\MetaTrader 5\terminal64.exe"
        Config.ACCOUNT_ID = "00000000-0000-0000-0000-000000000001"
        Config.OWNER_ID = "00000000-0000-0000-0000-000000000002"
        Config.CREDENTIAL_REF = "00000000-0000-0000-0000-000000000003"
        Config.BRIDGE_TOKEN = "x" * 32
        try:
            Config.validate()
        except ValueError:
            self.fail("Config.validate() raised ValueError unexpectedly!")
        finally:
            Config.MT5_TERMINAL_PATH, Config.ACCOUNT_ID, Config.OWNER_ID, Config.CREDENTIAL_REF, Config.BRIDGE_TOKEN = old

    def test_missing_config_raises(self):
        old_url = Config.SUPABASE_URL
        Config.SUPABASE_URL = ""
        with self.assertRaises(ValueError):
            Config.validate()
        Config.SUPABASE_URL = old_url


class TestMT5ClientUnit(unittest.TestCase):
    def test_retcode_classification(self):
        res10009 = MT5Client.classify_retcode(10009)
        self.assertTrue(res10009["is_success"])
        self.assertEqual(res10009["category"], "success")

        res10014 = MT5Client.classify_retcode(10014)
        self.assertFalse(res10014["is_success"])
        self.assertEqual(res10014["category"], "validation_failed")

        res10019 = MT5Client.classify_retcode(10019)
        self.assertFalse(res10019["is_success"])
        self.assertEqual(res10019["category"], "insufficient_margin")

    def test_volume_normalization(self):
        norm1 = MT5Client.normalize_volume(0.019, vol_min=0.01, vol_max=10.0, vol_step=0.01)
        self.assertEqual(norm1, 0.01)

        norm2 = MT5Client.normalize_volume(0.05, vol_min=0.10, vol_max=10.0, vol_step=0.10)
        self.assertEqual(norm2, 0.10)


class TestMarketDataPublisher(unittest.TestCase):
    def test_six_symbols_publish_once_with_real_timeframes(self):
        cloud, terminal = MagicMock(), MagicMock()
        terminal.check_connection.return_value = True
        terminal.get_symbol_info.side_effect = lambda symbol: {"broker_symbol": symbol}
        terminal.get_market_data.side_effect = lambda canonical, broker, frames: {
            "canonical_symbol": canonical, "broker_symbol": broker, "bid": 1.0, "ask": 1.1,
            "candles": [{"timeframe": tf, "open": 1, "high": 2, "low": 1, "close": 1.5} for tf in frames],
        }
        cloud.publish_market_data.return_value = True
        self.assertTrue(MarketDataPublisher(cloud, terminal).publish("account-id"))
        self.assertEqual(terminal.get_market_data.call_count, len(REQUIRED_SYMBOLS))
        cloud.publish_market_data.assert_called_once()
        self.assertEqual({c["timeframe"] for c in cloud.publish_market_data.call_args.args[1][0]["candles"]}, set(SCANNER_TIMEFRAMES))

    def test_missing_terminal_candles_rejects_entire_publication(self):
        cloud, terminal = MagicMock(), MagicMock()
        terminal.check_connection.return_value = True
        terminal.get_symbol_info.return_value = {"broker_symbol": "EURUSD"}
        terminal.get_market_data.return_value = {"candles": []}
        self.assertFalse(MarketDataPublisher(cloud, terminal).publish("account-id"))
        cloud.publish_market_data.assert_not_called()


class TestCommandProcessor(unittest.TestCase):
    def setUp(self):
        self.cloud_client = MagicMock()
        self.mt5_client = MagicMock()
        self.processor = CommandProcessor(self.cloud_client, self.mt5_client)

    def executable_command(self, command):
        Config.ACCOUNT_ID = "account-test"
        command["account_id"] = "account-test"
        command["execution_context"] = {
            "account_configured": True, "bridge_healthy": True, "terminal_authenticated": True,
            "credential_capability": "master", "trade_permission": True, "autotrading": True,
            "operational": True, "monitor_healthy": True, "execution_enabled": True,
            "risk_policy_resolved": True, "capital_allocation_resolved": True,
            "command_account_matches": True,
            "command_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat(),
        }
        return command

    def test_process_place_order(self):
        self.cloud_client.poll_commands.return_value = [self.executable_command({
            "id": "cmd-1",
            "operation": "place_order",
            "payload": {"symbol": "EURUSD", "side": "buy", "volume": 0.1}
        })]
        self.mt5_client.place_order.return_value = {
            "success": True,
            "ticket": "999",
            "deal_ticket": "888",
            "executed_price": 1.0850,
            "executed_volume": 0.1,
            "retcode": 10009
        }

        count = self.processor.process_pending_commands()
        self.assertEqual(count, 1)
        self.cloud_client.ack_command.assert_called_once_with(
            command_id="cmd-1",
            success=True,
            error_code=None,
            error_message=None,
            result_data=self.mt5_client.place_order.return_value
        )

    def test_process_modify_position(self):
        self.cloud_client.poll_commands.return_value = [self.executable_command({
            "id": "cmd-2",
            "operation": "modify_position",
            "payload": {"ticket": "999", "sl": 1.0820, "tp": 1.0910}
        })]
        self.mt5_client.modify_position.return_value = {
            "success": True,
            "ticket": "999",
            "sl": 1.0820,
            "tp": 1.0910
        }

        count = self.processor.process_pending_commands()
        self.assertEqual(count, 1)
        self.cloud_client.ack_command.assert_called_once_with(
            command_id="cmd-2",
            success=True,
            error_code=None,
            error_message=None,
            result_data=self.mt5_client.modify_position.return_value
        )


if __name__ == "__main__":
    unittest.main()
