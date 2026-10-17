"""
HashiBot MT5 Agent - Symbol Specification Synchronization Manager
Collects broker symbol metadata (digits, contract size, volume min/max/step, stops level)
and synchronizes with mt5_symbol_specs.
"""

from typing import List, Dict, Any
from cloud_client import CloudClient
from mt5_client import MT5Client
from logging_config import logger

DEFAULT_SYMBOLS = [
    "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
    "USDCHF", "NZDUSD", "XAUUSD", "EURGBP", "EURJPY"
]

class SymbolSyncManager:
    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client

    def sync_symbol_specifications(self, account_id: str, custom_symbols: List[str] = None) -> bool:
        if not self.mt5_client.check_connection():
            logger.debug("[SymbolSync] Skipped symbol sync - MT5 terminal not connected")
            return False

        symbols = custom_symbols or DEFAULT_SYMBOLS
        collected_specs: List[Dict[str, Any]] = []

        for sym in symbols:
            info = self.mt5_client.get_symbol_info(sym)
            if info:
                collected_specs.append({
                    "canonical_symbol": sym,
                    "broker_symbol": info["broker_symbol"],
                    "digits": info["digits"],
                    "point": info["point"],
                    "contract_size": info["contract_size"],
                    "volume_min": info["volume_min"],
                    "volume_max": info["volume_max"],
                    "volume_step": info["volume_step"],
                    "stops_level_points": info["stops_level_points"],
                    "fill_policies": info["fill_policies"],
                    **{key: info.get(key) for key in ("tick_size", "tick_value", "currency_profit", "account_currency", "quote_to_account_conversion", "tick_at", "trade_mode", "bid", "ask")}
                })

        if not collected_specs:
            logger.warning("[SymbolSync] No symbol specifications collected from MT5 terminal")
            return False

        success = self.cloud_client.sync_symbol_specs(account_id=account_id, specs=collected_specs)
        if success:
            logger.info(f"[SymbolSync] Synchronized {len(collected_specs)} symbol specification(s) for account {account_id}")
        else:
            logger.warning(f"[SymbolSync] Failed to sync symbol specifications for account {account_id}")

        return success

