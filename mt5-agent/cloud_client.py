"""
HashiBot MT5 Agent - Cloud Communication Client
Handles HTTP REST interactions with HashiBot Supabase Edge Functions using requests or urllib.
"""

import json
from typing import Dict, Any, List, Optional
from config import Config
from logging_config import logger

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.request
    import urllib.error
    HAS_REQUESTS = False


class CloudClient:
    def __init__(self):
        Config.validate()
        self.base_url = Config.SUPABASE_URL
        self.service_role_key = Config.SUPABASE_SERVICE_ROLE_KEY
        self.bridge_id = Config.BRIDGE_ID
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key
        }

    def _bridge_url(self, action: str) -> str:
        return f"{self.base_url}/functions/v1/mt5-bridge?action={action}"

    def _post(self, url: str, payload: Dict[str, Any], timeout: int = 10) -> tuple[int, Dict[str, Any]]:
        if HAS_REQUESTS:
            res = requests.post(url, json=payload, headers=self.headers, timeout=timeout)
            try:
                data = res.json()
            except Exception:
                data = {}
            return res.status_code, data
        else:
            data_bytes = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data_bytes, headers=self.headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    body = response.read().decode("utf-8")
                    return response.status, json.loads(body) if body else {}
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8")
                try:
                    data = json.loads(body)
                except Exception:
                    data = {}
                return e.code, data
            except Exception as e:
                logger.error(f"[CloudClient] urllib POST error: {e}")
                return 500, {"error": str(e)}

    def send_heartbeat(self, status: str = "online", connection_info: Optional[Dict[str, Any]] = None) -> bool:
        url = self._bridge_url("heartbeat")
        payload = {
            "bridge_id": self.bridge_id,
            "status": status,
            "connection_info": connection_info or {}
        }

        code, data = self._post(url, payload)
        if code == 200 and data.get("success"):
            logger.debug(f"[CloudClient] Heartbeat delivered successfully for bridge {self.bridge_id}")
            return True
        else:
            logger.warning(f"[CloudClient] Heartbeat failed ({code}): {data}")
            return False

    def poll_commands(self) -> List[Dict[str, Any]]:
        url = self._bridge_url("poll_commands")
        payload = {"bridge_id": self.bridge_id, "max_commands": 10}

        code, data = self._post(url, payload)
        if code == 200 and data.get("success"):
            cmds = data.get("commands", [])
            if cmds:
                logger.info(f"[CloudClient] Claimed {len(cmds)} command(s) for bridge {self.bridge_id}")
            return cmds
        else:
            logger.warning(f"[CloudClient] Command poll failed ({code}): {data}")
            return []

    def ack_command(self, command_id: Any, success: bool, error_code: Optional[str] = None, error_message: Optional[str] = None, result_data: Optional[Dict[str, Any]] = None) -> bool:
        url = self._bridge_url("ack_command")
        payload = {
            "bridge_id": self.bridge_id,
            "command_id": command_id,
            "success": success,
            "error_code": error_code,
            "error_message": error_message,
            "result": result_data or {}
        }

        code, data = self._post(url, payload)
        if code == 200 and data.get("success"):
            logger.info(f"[CloudClient] Acknowledged command #{command_id} (Success={success})")
            return True
        else:
            logger.warning(f"[CloudClient] Ack command #{command_id} failed ({code}): {data}")
            return False

    def sync_state(self, account_number: str, broker: str, balance: float, equity: float, margin: float, unrealized_pnl: float, positions: List[Dict[str, Any]], orders: Optional[List[Dict[str, Any]]] = None, account_id: Optional[str] = None) -> bool:
        url = self._bridge_url("sync_state")
        payload = {
            "bridge_id": self.bridge_id,
            "account_id": account_id,
            "account_number": str(account_number),
            "broker": broker,
            "snapshot": {
                "balance": balance,
                "equity": equity,
                "margin": margin,
                "free_margin": max(0.0, equity - margin),
                "floating_pnl": unrealized_pnl,
                "currency": "USD"
            },
            "positions": positions,
            "orders": orders or []
        }

        code, data = self._post(url, payload)
        if code == 200 and data.get("success"):
            logger.debug(f"[CloudClient] State sync completed for account {account_number}")
            return True
        else:
            logger.warning(f"[CloudClient] State sync failed ({code}): {data}")
            return False

    def sync_symbol_specs(self, account_id: str, specs: List[Dict[str, Any]]) -> bool:
        if not account_id or not specs:
            return False

        url = self._bridge_url("sync_symbols")
        payload = {
            "bridge_id": self.bridge_id,
            "account_id": account_id,
            "specs": specs
        }

        code, data = self._post(url, payload)
        if code == 200 and data.get("success"):
            logger.info(f"[CloudClient] Synchronized {len(specs)} symbol spec(s) for account {account_id}")
            return True
        else:
            logger.warning(f"[CloudClient] Symbol spec sync failed ({code}): {data}")
            return False
