"""
HashiBot MT5 Agent - State Synchronization Manager
Periodically captures MT5 account balance, equity, margin, open positions, and orders,
syncing them with the cloud database.
"""

from cloud_client import CloudClient
from mt5_client import MT5Client
from logging_config import logger

class StateSyncManager:
    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client

    def sync_account_state(self) -> bool:
        if not self.mt5_client.check_connection():
            logger.debug("[StateSync] Skipped sync - MT5 terminal not connected")
            return False

        acc_info = self.mt5_client.get_account_info()
        positions = self.mt5_client.get_positions()
        orders = self.mt5_client.get_orders()
        history = self.mt5_client.get_history()
        terminal = self.mt5_client.get_terminal_info()
        
        account_number = str(acc_info.get("login", ""))
        broker = acc_info.get("broker", "Unknown")
        balance = acc_info.get("balance", 0.0)
        equity = acc_info.get("equity", 0.0)
        margin = acc_info.get("margin", 0.0)
        unrealized_pnl = acc_info.get("profit", 0.0)

        if not account_number or account_number == "0":
            logger.warning("[StateSync] Invalid account number retrieved from MT5 terminal")
            return False

        success = self.cloud_client.sync_state(
            account_number=account_number,
            broker=broker,
            balance=balance,
            equity=equity,
            margin=margin,
            unrealized_pnl=unrealized_pnl,
            positions=positions,
            orders=orders,
            history=history,
            account_id=__import__('config').Config.ACCOUNT_ID or None,
            snapshot_extra={
                "environment": acc_info.get("environment"), "history_coverage": getattr(self.mt5_client, "last_history_range", None),
                "margin_level": acc_info.get("margin_level"), "currency": acc_info.get("currency"),
                "free_margin": acc_info.get("free_margin"),
                "leverage": acc_info.get("leverage"), "account_name": acc_info.get("name"),
                "server": acc_info.get("server"), "terminal_authenticated": True,
                "trade_permission": acc_info.get("trade_allowed", False),
                "autotrading": terminal.get("autotrading", False), "terminal": terminal,
            },
        )

        if success:
            logger.debug(f"[StateSync] State synchronized: Equity=${equity:.2f}, Balance=${balance:.2f}, Positions={len(positions)}")
        else:
            logger.warning(f"[StateSync] Failed to sync account state for #{account_number}")

        return success
