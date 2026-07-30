"""Publish broker ticks and genuine MT5 candles to durable cloud storage."""

from cloud_client import CloudClient
from logging_config import logger
from mt5_client import MT5Client

REQUIRED_SYMBOLS = ("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD")
SCANNER_TIMEFRAMES = ("5m", "15m", "1h", "4h")


class MarketDataPublisher:
    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client

    def publish(self, account_id: str) -> bool:
        if not account_id or not self.mt5_client.check_connection():
            return False
        feeds = []
        for canonical in REQUIRED_SYMBOLS:
            spec = self.mt5_client.get_symbol_info(canonical)
            if not spec:
                logger.warning("operation=market_data_extract symbol=%s error_code=MT5_SYMBOL_UNAVAILABLE", canonical)
                return False
            try:
                feed = self.mt5_client.get_market_data(canonical, spec["broker_symbol"], list(SCANNER_TIMEFRAMES))
            except (RuntimeError, ValueError) as error:
                logger.warning("operation=market_data_extract symbol=%s error_code=%s", canonical, str(error))
                return False
            if {c["timeframe"] for c in feed["candles"]} != set(SCANNER_TIMEFRAMES):
                logger.warning("operation=market_data_extract symbol=%s error_code=MT5_CANDLES_UNAVAILABLE", canonical)
                return False
            feeds.append(feed)
        published = self.cloud_client.publish_market_data(account_id, feeds)
        logger.info("operation=market_data_publish feeds=%s error_code=%s", len(feeds), "NONE" if published else "MT5_MARKET_DATA_PUBLISH_FAILED")
        return published
