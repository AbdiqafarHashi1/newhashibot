"""
HashiBot MT5 Agent - Main Runtime Daemon
Coordinates MT5 terminal connection, cloud communication, heartbeats,
command polling/execution, state sync, single-instance locking, and fail-closed safety.
"""

import os
import sys
import time
import signal
import atexit
from config import Config
from logging_config import setup_logging, logger
from mt5_client import MT5Client, HAS_MT5
from cloud_client import CloudClient
from heartbeat import HeartbeatManager
from command_processor import CommandProcessor
from state_sync import StateSyncManager
from symbol_sync import SymbolSyncManager
from market_data import MarketDataPublisher

LOCK_FILE_PATH = os.path.join(
    Config.RUNTIME_DIR,
    f".mt5_agent.{os.getenv('MT5_ACCOUNT_ID', 'legacy')}.lock",
)

class MT5AgentDaemon:
    def __init__(self):
        Config.validate(check_paths=True)
        setup_logging(Config.LOG_LEVEL)
        logger.info("==================================================")
        logger.info("   Starting HashiBot MT5 Terminal Agent Daemon    ")
        logger.info("==================================================")
        logger.info(f"Bridge ID: {Config.BRIDGE_ID}")
        logger.info(f"Supabase Endpoint: {Config.SUPABASE_URL}")
        logger.info(f"Poll Interval: {Config.POLL_INTERVAL_SECONDS}s | Heartbeat Interval: {Config.HEARTBEAT_INTERVAL_SECONDS}s")

        self._acquire_single_instance_lock()
        atexit.register(self._release_single_instance_lock)

        try:
            # Fail-closed safety check
            if not HAS_MT5 and not Config.ALLOW_OFFLINE_TEST_MODE:
                raise RuntimeError("MT5_LIBRARY_UNAVAILABLE: MetaTrader5 library is unavailable")

            self.running = True
            self.mt5_client = MT5Client(terminal_path=Config.MT5_TERMINAL_PATH)
            self.cloud_client = CloudClient()
            logger.info("operation=startup stage=register_bridge")
            self.cloud_client.register_bridge()
            if Config.ACCOUNT_ID:
                logger.info("operation=startup stage=assign_explicit_account account_id=%s", Config.ACCOUNT_ID)
                self.cloud_client.assign_explicit_account()
            logger.info("operation=startup stage=discover_accounts")
            discovered = self.cloud_client.discover_accounts()
            assigned = next((a for a in discovered if a["account_id"] == Config.ACCOUNT_ID and a["owner_id"] == Config.OWNER_ID), None)
            if not assigned:
                raise RuntimeError("BRIDGE_ACCOUNT_SCOPE_MISMATCH: configured account is not assigned")
            if assigned["credential_ref"] != Config.CREDENTIAL_REF:
                raise RuntimeError("CREDENTIAL_REF_MISMATCH: configured credential reference differs")
            # Plaintext exists only in worker memory and is never logged or persisted.
            credential = self.cloud_client.retrieve_credential(
                Config.ACCOUNT_ID, Config.OWNER_ID, assigned["credential_ref"]
            )
        except BaseException:
            self._release_single_instance_lock()
            raise
        Config.ACCOUNT_NUMBER = int(credential["login"])
        Config.PASSWORD = credential["password"]
        Config.SERVER = credential["server"]
        self.credential_capability = credential["capability"]
        if Config.DATA_ONLY and self.credential_capability != "investor":
            self._release_single_instance_lock()
            raise RuntimeError("DATA_ONLY_INVESTOR_CREDENTIAL_REQUIRED")
        self.heartbeat_mgr = HeartbeatManager(self.cloud_client, self.mt5_client)
        self.command_processor = CommandProcessor(self.cloud_client, self.mt5_client)
        self.state_sync_mgr = StateSyncManager(self.cloud_client, self.mt5_client)
        self.symbol_sync_mgr = SymbolSyncManager(self.cloud_client, self.mt5_client)
        self.market_data_publisher = MarketDataPublisher(self.cloud_client, self.mt5_client)

        self.last_heartbeat = 0.0
        self.last_poll = 0.0
        self.last_state_sync = 0.0
        self.last_symbol_sync = 0.0
        self.last_market_data = 0.0

        self.reconnect_backoff = 2.0
        self.max_reconnect_backoff = 60.0

        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

    def _acquire_single_instance_lock(self):
        os.makedirs(os.path.dirname(LOCK_FILE_PATH), exist_ok=True)
        try:
            fd = os.open(LOCK_FILE_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(str(os.getpid()))
            logger.info(f"[Daemon] Single-instance lock acquired successfully (PID={os.getpid()}).")
        except FileExistsError:
            try:
                with open(LOCK_FILE_PATH, encoding="ascii") as lock_file:
                    existing_pid = int(lock_file.read().strip())
                os.kill(existing_pid, 0)
            except (ProcessLookupError, ValueError, OSError):
                os.remove(LOCK_FILE_PATH)
                return self._acquire_single_instance_lock()
            raise RuntimeError(f"MT5_DUPLICATE_WORKER: account lock held by PID {existing_pid}") from None
        except Exception as e:
            logger.error(f"[Daemon] Could not create single-instance lock file: {e}")

    def _release_single_instance_lock(self):
        if os.path.exists(LOCK_FILE_PATH):
            try:
                with open(LOCK_FILE_PATH, encoding="ascii") as lock_file:
                    if int(lock_file.read().strip()) != os.getpid():
                        return
                os.remove(LOCK_FILE_PATH)
                logger.info("[Daemon] Single-instance lock file released.")
            except Exception as e:
                logger.warning(f"[Daemon] Could not remove lock file: {e}")

    def _handle_signal(self, signum, frame):
        logger.info(f"[Daemon] Received exit signal ({signum}). Initiating graceful shutdown...")
        self.running = False

    def connect_mt5(self) -> bool:
        logger.info("[Daemon] Connecting to MetaTrader 5 terminal...")
        connected = self.mt5_client.initialize(
            login=Config.ACCOUNT_NUMBER,
            password=Config.PASSWORD,
            server=Config.SERVER
            , portable=Config.MT5_PORTABLE
        )
        if connected:
            proof = self.mt5_client.verify_connection(Config.ACCOUNT_NUMBER, "", Config.SERVER)
            if not proof.get("ok"):
                logger.error("operation=terminal_verify error_code=%s", proof.get("blocker"))
                self.mt5_client.is_connected = False
                return False
            if proof.get("account", {}).get("environment") != "demo" and not (Config.DATA_ONLY and self.credential_capability == "investor"):
                logger.error("operation=terminal_verify error_code=LIVE_EXECUTION_PROHIBITED")
                self.mt5_client.is_connected = False
                return False
            if Config.CUSTOMER_PAIRING_CODE:
                self.cloud_client.pair_customer_account(proof["account"])
            if self.credential_capability == "investor":
                logger.info("operation=terminal_verify error_code=INVESTOR_AUTHENTICATED")
            logger.info("[Daemon] MetaTrader 5 connection established.")
            self.reconnect_backoff = 2.0
            return True
        else:
            logger.warning(f"[Daemon] Failed to connect to MT5. Retrying in {self.reconnect_backoff:.1f}s...")
            return False

    def run(self):
        self._run_stage("connect", self.connect_mt5)
        logger.info("[Daemon] Event loop active. Press Ctrl+C to stop.")
        
        while self.running:
            now = time.time()

            if not self._run_stage("connection_health", self.mt5_client.check_connection):
                if Config.ALLOW_OFFLINE_TEST_MODE:
                    # In offline test mode, process commands without looping indefinitely on reconnect
                    pass
                else:
                    logger.warning("[Daemon] Connection lost or not established with MT5 terminal.")
                    time.sleep(self.reconnect_backoff)
                    self._run_stage("reconnect", self.connect_mt5)
                    self.reconnect_backoff = min(self.reconnect_backoff * 1.5, self.max_reconnect_backoff)
                    continue

            # 2. Heartbeat Tick
            if now - self.last_heartbeat >= Config.HEARTBEAT_INTERVAL_SECONDS:
                self._run_stage("heartbeat", self.heartbeat_mgr.send_heartbeat)
                self.last_heartbeat = now

            # 3. State Synchronization Tick
            if not Config.DATA_ONLY and now - self.last_state_sync >= Config.STATE_SYNC_INTERVAL_SECONDS:
                self._run_stage("account_snapshot", self.state_sync_mgr.sync_account_state)
                self.last_state_sync = now

            # 4. Symbol Specification Synchronization Tick
            if now - self.last_symbol_sync >= Config.SYMBOL_SYNC_INTERVAL_SECONDS:
                acc_info = self._run_stage("symbol_account", self.mt5_client.get_account_info) or {}
                acc_num = str(acc_info.get("login", ""))
                if acc_num and acc_num != "0":
                    self._run_stage("symbol_specs", lambda: self.symbol_sync_mgr.sync_symbol_specifications(account_id=Config.ACCOUNT_ID))
                self.last_symbol_sync = now

            # Missing broker candles fail closed; no synthetic/provider fallback.
            if now - self.last_market_data >= Config.MARKET_DATA_INTERVAL_SECONDS:
                self._run_stage("market_data", lambda: self.market_data_publisher.publish(Config.ACCOUNT_ID))
                self.last_market_data = now

            # 5. Command Polling & Execution Tick
            if now - self.last_poll >= Config.POLL_INTERVAL_SECONDS:
                self._run_stage("commands", self.command_processor.process_pending_commands)
                if not Config.DATA_ONLY:
                    self._run_stage("position_protection", self.command_processor.managed_positions.monitor)
                self.last_poll = now

            time.sleep(0.2)

        self._shutdown()

    @staticmethod
    def _run_stage(name, action):
        """An unavailable read or cloud request cannot terminate unrelated feed/protection stages."""
        try:
            return action()
        except Exception as error:
            # Do not log request bodies, credentials or provider response strings.
            logger.warning("operation=runtime_stage stage=%s error_type=%s retry=scheduled", name, type(error).__name__)
            return False

    def _shutdown(self):
        logger.info("[Daemon] Performing final shutdown operations...")
        try:
            self.cloud_client.send_heartbeat(status="offline", connection_info={"reason": "graceful_shutdown"})
        except Exception as e:
            logger.error(f"[Daemon] Error sending offline heartbeat: {e}")

        self._release_single_instance_lock()
        logger.info("[Daemon] HashiBot MT5 Agent stopped gracefully.")

def main():
    try:
        daemon = MT5AgentDaemon()
        daemon.run()
    except Exception as e:
        logger.critical(f"[Daemon] Fatal error in main runtime loop: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
