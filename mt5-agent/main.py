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

LOCK_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".mt5_agent.lock")

class MT5AgentDaemon:
    def __init__(self):
        Config.validate()
        setup_logging(Config.LOG_LEVEL)
        logger.info("==================================================")
        logger.info("   Starting HashiBot MT5 Terminal Agent Daemon    ")
        logger.info("==================================================")
        logger.info(f"Bridge ID: {Config.BRIDGE_ID}")
        logger.info(f"Supabase Endpoint: {Config.SUPABASE_URL}")
        logger.info(f"Poll Interval: {Config.POLL_INTERVAL_SECONDS}s | Heartbeat Interval: {Config.HEARTBEAT_INTERVAL_SECONDS}s")

        self._acquire_single_instance_lock()

        # Fail-closed safety check
        if not HAS_MT5 and not Config.ALLOW_OFFLINE_TEST_MODE:
            logger.critical(
                "[Daemon] FAIL-CLOSED: MetaTrader5 library unavailable in current environment. "
                "Startup aborted to protect against mock live execution. "
                "Set ALLOW_OFFLINE_TEST_MODE=true in .env if executing offline/unit tests."
            )
            self._release_single_instance_lock()
            sys.exit(1)

        self.running = True
        self.mt5_client = MT5Client(terminal_path=Config.MT5_TERMINAL_PATH)
        self.cloud_client = CloudClient()
        self.heartbeat_mgr = HeartbeatManager(self.cloud_client, self.mt5_client)
        self.command_processor = CommandProcessor(self.cloud_client, self.mt5_client)
        self.state_sync_mgr = StateSyncManager(self.cloud_client, self.mt5_client)
        self.symbol_sync_mgr = SymbolSyncManager(self.cloud_client, self.mt5_client)

        self.last_heartbeat = 0.0
        self.last_poll = 0.0
        self.last_state_sync = 0.0
        self.last_symbol_sync = 0.0

        self.reconnect_backoff = 2.0
        self.max_reconnect_backoff = 60.0

        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)
        atexit.register(self._release_single_instance_lock)

    def _acquire_single_instance_lock(self):
        if os.path.exists(LOCK_FILE_PATH):
            try:
                with open(LOCK_FILE_PATH, "r") as f:
                    pid = f.read().strip()
                logger.warning(f"[Daemon] Lock file exists (PID={pid}). Checking process status...")
            except Exception:
                pass
            # Clean lock if stale or raise if active
            logger.warning("[Daemon] Reclaiming lock file for single-instance daemon.")
        
        try:
            with open(LOCK_FILE_PATH, "w") as f:
                f.write(str(os.getpid()))
            logger.info(f"[Daemon] Single-instance lock acquired successfully (PID={os.getpid()}).")
        except Exception as e:
            logger.error(f"[Daemon] Could not create single-instance lock file: {e}")

    def _release_single_instance_lock(self):
        if os.path.exists(LOCK_FILE_PATH):
            try:
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
        )
        if connected:
            logger.info("[Daemon] MetaTrader 5 connection established.")
            self.reconnect_backoff = 2.0
            return True
        else:
            logger.warning(f"[Daemon] Failed to connect to MT5. Retrying in {self.reconnect_backoff:.1f}s...")
            return False

    def run(self):
        self.connect_mt5()
        logger.info("[Daemon] Event loop active. Press Ctrl+C to stop.")
        
        while self.running:
            now = time.time()

            if not self.mt5_client.check_connection():
                if Config.ALLOW_OFFLINE_TEST_MODE:
                    # In offline test mode, process commands without looping indefinitely on reconnect
                    pass
                else:
                    logger.warning("[Daemon] Connection lost or not established with MT5 terminal.")
                    time.sleep(self.reconnect_backoff)
                    self.connect_mt5()
                    self.reconnect_backoff = min(self.reconnect_backoff * 1.5, self.max_reconnect_backoff)
                    continue

            # 2. Heartbeat Tick
            if now - self.last_heartbeat >= Config.HEARTBEAT_INTERVAL_SECONDS:
                self.heartbeat_mgr.send_heartbeat()
                self.last_heartbeat = now

            # 3. State Synchronization Tick
            if now - self.last_state_sync >= Config.STATE_SYNC_INTERVAL_SECONDS:
                self.state_sync_mgr.sync_account_state()
                self.last_state_sync = now

            # 4. Symbol Specification Synchronization Tick
            if now - self.last_symbol_sync >= Config.SYMBOL_SYNC_INTERVAL_SECONDS:
                acc_info = self.mt5_client.get_account_info()
                acc_num = str(acc_info.get("login", ""))
                if acc_num and acc_num != "0":
                    self.symbol_sync_mgr.sync_symbol_specifications(account_id=acc_num)
                self.last_symbol_sync = now

            # 5. Command Polling & Execution Tick
            if now - self.last_poll >= Config.POLL_INTERVAL_SECONDS:
                self.command_processor.process_pending_commands()
                self.last_poll = now

            time.sleep(0.2)

        self._shutdown()

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
