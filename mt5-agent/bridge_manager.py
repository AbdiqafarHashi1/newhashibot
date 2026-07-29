"""Multi-account supervisor. One process, lock and terminal data directory per account UUID."""

import json
import os
import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional


@dataclass(frozen=True)
class AccountInstance:
    account_id: str
    owner_id: str
    broker: str
    server: str
    login: str
    account_class: str
    credential_ref: str
    terminal_path: str
    data_path: str


class BridgeManager:
    """Thread-safe process registry which prevents duplicate canonical-account workers."""

    def __init__(self, runtime_root: str, worker_path: Optional[str] = None):
        self.root = Path(runtime_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.worker_path = worker_path or str(Path(__file__).with_name("main.py"))
        self._processes: Dict[str, subprocess.Popen] = {}
        self._accounts: Dict[str, AccountInstance] = {}
        self._lock = threading.RLock()

    def start(self, account: AccountInstance) -> int:
        with self._lock:
            current = self._processes.get(account.account_id)
            if current and current.poll() is None:
                return current.pid
            account_dir = self.root / account.account_id
            account_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            lock = account_dir / "identity.json"
            lock.write_text(json.dumps({
                "account_id": account.account_id, "owner_id": account.owner_id,
                "server": account.server,
            }), encoding="utf-8")
            env = os.environ.copy()
            env.update({
                "MT5_ACCOUNT_ID": account.account_id, "MT5_OWNER_ID": account.owner_id,
                "MT5_TERMINAL_PATH": account.terminal_path,
                "MT5_TERMINAL_DATA_PATH": account.data_path,
                "MT5_WORKER_ID": f"worker:{account.account_id}",
            })
            # Password is deliberately never placed in the manifest, command line, or manager logs.
            process = subprocess.Popen([sys.executable, self.worker_path], cwd=str(account_dir), env=env)
            self._processes[account.account_id] = process
            self._accounts[account.account_id] = account
            return process.pid

    def stop(self, account_id: str, timeout: float = 15.0) -> bool:
        with self._lock:
            process = self._processes.get(account_id)
            if not process or process.poll() is not None:
                self._processes.pop(account_id, None)
                return False
            process.terminate()
            try:
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            self._processes.pop(account_id, None)
            return True

    def restart(self, account_id: str) -> int:
        with self._lock:
            account = self._accounts[account_id]
        self.stop(account_id)
        return self.start(account)

    reconnect = restart

    def health(self, account_id: str) -> str:
        with self._lock:
            process = self._processes.get(account_id)
            return "HEALTHY" if process and process.poll() is None else "OFFLINE"

    def list_instances(self) -> List[Dict[str, object]]:
        with self._lock:
            return [{"account_id": key, "pid": process.pid, "health": self.health(key)}
                    for key, process in self._processes.items()]

    def recover(self) -> List[str]:
        with self._lock:
            crashed = [key for key, process in self._processes.items() if process.poll() is not None]
        for account_id in crashed:
            self.restart(account_id)
        return crashed

    def discover_and_start(self, cloud_client, terminal_paths: Dict[str, Dict[str, str]]) -> List[int]:
        """Start exactly one worker for each backend assignment with an isolated mapping.

        ``terminal_paths`` is deployment configuration keyed by canonical account UUID;
        credentials deliberately never enter the manager or its manifests.
        """
        pids: List[int] = []
        for row in cloud_client.discover_accounts():
            account_id = row["account_id"]
            paths = terminal_paths.get(account_id)
            if not paths:
                continue
            pids.append(self.start(AccountInstance(
                account_id, row["owner_id"], row["broker"], row["server"], "",
                row["account_class"], row["credential_ref"], paths["terminal_path"], paths["data_path"],
            )))
        return pids
