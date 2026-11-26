"""Deterministic, fail-closed configuration for the canonical MT5 worker."""

import os
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

AGENT_DIR = Path(__file__).resolve().parent
DOTENV_PATH = Path(os.environ.get("MT5_ENV_FILE", AGENT_DIR / ".env")).resolve()
load_dotenv(DOTENV_PATH, override=False)


class Config:
    """Environment contract. Secrets are fetched by the worker and never configured here."""

    SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    BRIDGE_TOKEN = os.getenv("MT5_BRIDGE_TOKEN", "")
    BRIDGE_ID = os.getenv("BRIDGE_ID", "")
    ACCOUNT_ID = os.getenv("MT5_ACCOUNT_ID", "")
    OWNER_ID = os.getenv("MT5_OWNER_ID", "")
    CUSTOMER_EXECUTION_ACCOUNT_ID = os.getenv("HASHIBOT_EXECUTION_ACCOUNT_ID", "")
    CUSTOMER_PAIRING_CODE = os.getenv("HASHIBOT_PAIRING_CODE", "")
    CREDENTIAL_REF = os.getenv("MT5_CREDENTIAL_REF", "")
    MT5_TERMINAL_PATH: Optional[str] = os.getenv("MT5_TERMINAL_PATH")
    MT5_TERMINAL_DATA_PATH: Optional[str] = os.getenv("MT5_TERMINAL_DATA_PATH")
    MT5_PORTABLE = os.getenv("MT5_PORTABLE", "false").lower() in ("1", "true", "yes")
    WORKER_ID = os.getenv("MT5_WORKER_ID", f"worker-{os.getpid()}")
    RUNTIME_DIR = os.getenv("MT5_RUNTIME_DIR", str(AGENT_DIR / ".runtime"))
    POLL_INTERVAL_SECONDS = float(os.getenv("POLL_INTERVAL_SECONDS", "1"))
    HEARTBEAT_INTERVAL_SECONDS = float(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "10"))
    STATE_SYNC_INTERVAL_SECONDS = float(os.getenv("STATE_SYNC_INTERVAL_SECONDS", "5"))
    SYMBOL_SYNC_INTERVAL_SECONDS = float(os.getenv("SYMBOL_SYNC_INTERVAL_SECONDS", "30"))
    MARKET_DATA_INTERVAL_SECONDS = float(os.getenv("MARKET_DATA_INTERVAL_SECONDS", "30"))
    ALLOW_LIVE_EXECUTION = os.getenv("MT5_ALLOW_LIVE_EXECUTION", "false").lower() in ("1", "true", "yes")
    DATA_ONLY = os.getenv("MT5_DATA_ONLY", "false").lower() in ("1", "true", "yes")
    MARKET_DATA_FEED_ID = os.getenv("MT5_MARKET_DATA_FEED_ID", "")
    ALLOW_OFFLINE_TEST_MODE = os.getenv("ALLOW_OFFLINE_TEST_MODE", "false").lower() in ("1", "true", "yes")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    GOLD_TURBO_ENABLED = os.getenv("HASHIBOT_GOLD_TURBO_ENABLED", "false").lower() in ("1", "true", "yes")
    AGENT_VERSION = "1.4.0-local-gold-turbo-demo"

    # Populated only after the authorized credential exchange.
    ACCOUNT_NUMBER: Optional[int] = None
    PASSWORD: Optional[str] = None
    SERVER: Optional[str] = None

    @staticmethod
    def _uuid(name: str, value: str, required: bool = True) -> None:
        if not value and not required:
            return
        try:
            uuid.UUID(value)
        except (ValueError, TypeError, AttributeError):
            raise ValueError(f"BRIDGE_CONFIGURATION_ERROR: {name} must be a UUID") from None

    @classmethod
    def validate(cls, check_paths: bool = False) -> None:
        missing = [name for name, value in {
            "SUPABASE_URL": cls.SUPABASE_URL, "BRIDGE_ID": cls.BRIDGE_ID,
            "MT5_TERMINAL_PATH": cls.MT5_TERMINAL_PATH,
        }.items() if not value]
        if len(cls.BRIDGE_TOKEN) < 32:
            missing.append("MT5_BRIDGE_TOKEN (minimum 32 characters)")
        if bool(cls.ACCOUNT_ID) != bool(cls.OWNER_ID):
            missing.append("MT5_ACCOUNT_ID and MT5_OWNER_ID (both or neither)")
        if cls.ACCOUNT_ID and not cls.CREDENTIAL_REF:
            missing.append("MT5_CREDENTIAL_REF")
        if missing:
            raise ValueError("BRIDGE_CONFIGURATION_ERROR: missing " + ", ".join(missing))
        if cls.DATA_ONLY and (not cls.MARKET_DATA_FEED_ID or cls.CUSTOMER_EXECUTION_ACCOUNT_ID or cls.CUSTOMER_PAIRING_CODE):
            raise ValueError("DATA_ONLY_CONFIGURATION_REQUIRED: dedicated feed identity, no customer execution pairing")
        cls._uuid("HASHIBOT_EXECUTION_ACCOUNT_ID", cls.CUSTOMER_EXECUTION_ACCOUNT_ID, False)
        if cls.CUSTOMER_PAIRING_CODE and not cls.CUSTOMER_EXECUTION_ACCOUNT_ID:
            raise ValueError("BRIDGE_CONFIGURATION_ERROR: pairing needs execution account ID")
        cls._uuid("MT5_ACCOUNT_ID", cls.ACCOUNT_ID, False)
        cls._uuid("MT5_OWNER_ID", cls.OWNER_ID, False)
        cls._uuid("MT5_CREDENTIAL_REF", cls.CREDENTIAL_REF, False)
        if check_paths:
            terminal = Path(str(cls.MT5_TERMINAL_PATH))
            if not terminal.is_file():
                raise ValueError(f"TERMINAL_NOT_FOUND: MT5_TERMINAL_PATH={terminal}")
            if cls.MT5_TERMINAL_DATA_PATH and not Path(cls.MT5_TERMINAL_DATA_PATH).is_dir():
                raise ValueError(f"DATA_PATH_NOT_FOUND: MT5_TERMINAL_DATA_PATH={cls.MT5_TERMINAL_DATA_PATH}")
            if cls.MT5_PORTABLE and not cls.MT5_TERMINAL_DATA_PATH:
                raise ValueError("BRIDGE_CONFIGURATION_ERROR: portable mode requires MT5_TERMINAL_DATA_PATH")
