"""
HashiBot MT5 Agent - Heartbeat Manager
Maintains periodic heartbeats reporting agent and terminal health to the cloud registry.
"""

import socket
from typing import Dict, Any
from config import Config
from cloud_client import CloudClient
from mt5_client import MT5Client
from logging_config import logger

class HeartbeatManager:
    VERSION = "v1.0.0-phase8c"

    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client
        self.hostname = socket.gethostname()

    def send_heartbeat(self) -> bool:
        conn_healthy = self.mt5_client.check_connection()
        term_info = self.mt5_client.get_terminal_info()
        acc_info = self.mt5_client.get_account_info()

        connection_info: Dict[str, Any] = {
            "version": self.VERSION,
            "hostname": self.hostname,
            "mt5_connected": conn_healthy,
            "terminal_connected": conn_healthy,
            "terminal_authenticated": bool(conn_healthy and acc_info.get("login") == Config.ACCOUNT_NUMBER and acc_info.get("server") == Config.SERVER),
            "data_only": Config.DATA_ONLY,
            "account_number": acc_info.get("login"),
            "broker": acc_info.get("broker"),
            "server": acc_info.get("server"),
            "terminal_build": term_info.get("build"),
            "terminal_path": term_info.get("path"),
            "capabilities": ["test_connection", "sync_account", "fetch_history", "market_data"] if Config.DATA_ONLY else [
                "place_order",
                "modify_position",
                "close_position",
                "cancel_order",
                "state_sync",
                "symbol_spec_sync"
            ]
        }

        status = "online" if conn_healthy else "degraded"
        success = self.cloud_client.send_heartbeat(status=status, connection_info=connection_info)
        
        if success:
            logger.info(f"[Heartbeat] Status '{status}' reported for Bridge #{self.cloud_client.bridge_id}")
        else:
            logger.warning(f"[Heartbeat] Failed to deliver heartbeat for Bridge #{self.cloud_client.bridge_id}")

        return success

