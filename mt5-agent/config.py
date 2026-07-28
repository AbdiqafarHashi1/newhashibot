"""
HashiBot MT5 Agent - Configuration Manager
Loads environment variables from .env file and provides validated settings.
"""

import os
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

class Config:
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    BRIDGE_ID: str = os.getenv("BRIDGE_ID", "bridge-mt5-001")
    
    POLL_INTERVAL_SECONDS: float = float(os.getenv("POLL_INTERVAL_SECONDS", "1.0"))
    HEARTBEAT_INTERVAL_SECONDS: float = float(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "10.0"))
    STATE_SYNC_INTERVAL_SECONDS: float = float(os.getenv("STATE_SYNC_INTERVAL_SECONDS", "5.0"))
    SYMBOL_SYNC_INTERVAL_SECONDS: float = float(os.getenv("SYMBOL_SYNC_INTERVAL_SECONDS", "300.0"))
    
    ALLOW_OFFLINE_TEST_MODE: bool = os.getenv("ALLOW_OFFLINE_TEST_MODE", "false").lower() in ("true", "1", "yes")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    
    MT5_TERMINAL_PATH: Optional[str] = os.getenv("MT5_TERMINAL_PATH", None)
    ACCOUNT_NUMBER: Optional[int] = int(os.getenv("ACCOUNT_NUMBER")) if os.getenv("ACCOUNT_NUMBER") else None
    PASSWORD: Optional[str] = os.getenv("PASSWORD", None)
    SERVER: Optional[str] = os.getenv("SERVER", None)
    ACCOUNT_ID: str = os.getenv("MT5_ACCOUNT_ID", "")
    OWNER_ID: str = os.getenv("MT5_OWNER_ID", "")
    CREDENTIAL_REF: str = os.getenv("MT5_CREDENTIAL_REF", "")

    @classmethod
    def validate(cls) -> None:
        missing = []
        if not cls.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not cls.SUPABASE_SERVICE_ROLE_KEY:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if not cls.BRIDGE_ID:
            missing.append("BRIDGE_ID")
            
        if missing:
            raise ValueError(f"Missing required environment variable(s): {', '.join(missing)}")
