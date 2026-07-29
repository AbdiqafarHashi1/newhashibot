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
        self.bridge_token = Config.BRIDGE_TOKEN
        self.bridge_id = Config.BRIDGE_ID
        
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
            "X-MT5-Bridge-Token": self.bridge_token,
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
                logger.error("operation=http_post error_code=BRIDGE_NETWORK_ERROR")
                return 500, {"error": "BRIDGE_NETWORK_ERROR"}

    def discover_accounts(self) -> List[Dict[str, Any]]:
        """Discover only accounts assigned by the backend to this manager."""
        code, data = self._post(self._bridge_url("discover_accounts"), {
            "bridge_id": self.bridge_id,
            "account_ids": [Config.ACCOUNT_ID] if Config.ACCOUNT_ID else [],
        })
        if code != 200 or not data.get("success"):
            raise RuntimeError(data.get("error_code", "MT5_DISCOVERY_FAILED"))
        return data.get("accounts", [])

    def retrieve_credential(self, account_id: str, owner_id: str, credential_ref: str) -> Dict[str, Any]:
        """Request transient plaintext from the trusted function; never read secret tables."""
        code, data = self._post(self._bridge_url("retrieve_credential"), {
            "bridge_id": self.bridge_id, "account_id": account_id,
            "owner_id": owner_id, "credential_ref": credential_ref,
            "worker_id": Config.WORKER_ID,
        })
        if code != 200 or not data.get("success"):
            raise RuntimeError(data.get("error_code", "MT5_CREDENTIAL_RETRIEVAL_FAILED"))
        return data["credential"]

    def send_heartbeat(self, status: str = "online", connection_info: Optional[Dict[str, Any]] = None) -> bool:
        url = self._bridge_url("heartbeat")
        payload = {
            "bridge_id": self.bridge_id,
            "account_id": Config.ACCOUNT_ID,
            "owner_id": Config.OWNER_ID,
            "worker_id": Config.WORKER_ID,
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
        payload = {"bridge_id": self.bridge_id, "account_id": Config.ACCOUNT_ID,
                   "owner_id": Config.OWNER_ID, "worker_id": Config.WORKER_ID, "max_commands": 1}

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
            "account_id": Config.ACCOUNT_ID,
            "owner_id": Config.OWNER_ID,
            "worker_id": Config.WORKER_ID,
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

    def sync_state(self, account_number: str, broker: str, balance: float, equity: float, margin: float, unrealized_pnl: float, positions: List[Dict[str, Any]], orders: Optional[List[Dict[str, Any]]] = None, account_id: Optional[str] = None, snapshot_extra: Optional[Dict[str, Any]] = None, history: Optional[List[Dict[str, Any]]] = None) -> bool:
        url = self._bridge_url("sync_state")
        payload = {
            "bridge_id": self.bridge_id,
            "account_id": account_id, "owner_id": Config.OWNER_ID,
            "worker_id": Config.WORKER_ID,
            "account_number": str(account_number),
            "broker": broker,
            "snapshot": {
                "balance": balance,
                "equity": equity,
                "margin": margin,
                "free_margin": max(0.0, equity - margin),
                "floating_pnl": unrealized_pnl,
                "currency": "USD", **(snapshot_extra or {})
            },
            "positions": positions,
            "orders": orders if orders is not None else [],
            "history": history if history is not None else [],
            "reads": {"positions": positions is not None, "orders": orders is not None, "history": history is not None},
        }

        code, data = self._post(url, payload)
        if code == 200 and data.get("success"):
            logger.debug("operation=snapshot_write account_id=%s error_code=NONE", account_id)
            return True
        else:
            logger.warning("operation=snapshot_write account_id=%s error_code=MT5_SNAPSHOT_FAILED", account_id)
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
