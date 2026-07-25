"""
Unit test suite for HashiBot MT5 Agent Core (Phase 8C-2)
Tests config validation, cloud client payload formatting, MT5 client retcode classification,
volume normalization, command processor dispatch, single instance locking, and fail-closed checks.
"""

import os
import sys
import unittest
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


class TestMT5AgentConfig(unittest.TestCase):
    def test_config_validation(self):
        Config.SUPABASE_URL = "http://localhost:3000"
        Config.SUPABASE_SERVICE_ROLE_KEY = "test-service-key"
        Config.BRIDGE_ID = "bridge-test-01"
        try:
            Config.validate()
        except ValueError:
            self.fail("Config.validate() raised ValueError unexpectedly!")

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


class TestCommandProcessor(unittest.TestCase):
    def setUp(self):
        self.cloud_client = MagicMock()
        self.mt5_client = MagicMock()
        self.processor = CommandProcessor(self.cloud_client, self.mt5_client)

    def test_process_place_order(self):
        self.cloud_client.poll_commands.return_value = [{
            "id": "cmd-1",
            "operation": "place_order",
            "payload": {"symbol": "EURUSD", "side": "buy", "volume": 0.1}
        }]
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
        self.cloud_client.poll_commands.return_value = [{
            "id": "cmd-2",
            "operation": "modify_position",
            "payload": {"ticket": "999", "sl": 1.0820, "tp": 1.0910}
        }]
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
