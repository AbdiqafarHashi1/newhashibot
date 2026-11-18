"""Publish broker ticks and genuine MT5 candles to durable cloud storage."""

import math
from config import Config
from cloud_client import CloudClient
from logging_config import logger
from mt5_client import MT5Client

REQUIRED_SYMBOLS = ("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD")
SCANNER_TIMEFRAMES = ("5m", "15m", "1h", "4h")
BOOTSTRAP_BARS = 1000
ROUTINE_BARS = 60
BARS_PER_FRAME_BATCH = 250


class MarketDataPublisher:
    def __init__(self, cloud_client: CloudClient, mt5_client: MT5Client):
        self.cloud_client = cloud_client
        self.mt5_client = mt5_client
        self._seeded_accounts = set()

    def publish(self, account_id: str) -> bool:
        if not account_id or not self.mt5_client.check_connection():
            return False
        bootstrap = Config.DATA_ONLY and account_id not in self._seeded_accounts
        feeds = []
        for canonical in REQUIRED_SYMBOLS:
            spec = self.mt5_client.get_symbol_info(canonical)
            if not spec:
                logger.warning("operation=market_data_extract symbol=%s error_code=MT5_SYMBOL_UNAVAILABLE", canonical)
                return False
            try:
                feed = self.mt5_client.get_market_data(canonical, spec["broker_symbol"], list(SCANNER_TIMEFRAMES), bars=BOOTSTRAP_BARS if bootstrap else ROUTINE_BARS)
            except (RuntimeError, ValueError) as error:
                logger.warning("operation=market_data_extract symbol=%s error_code=%s", canonical, str(error))
                return False
            if {c["timeframe"] for c in feed["candles"]} != set(SCANNER_TIMEFRAMES):
                logger.warning("operation=market_data_extract symbol=%s error_code=MT5_CANDLES_UNAVAILABLE", canonical)
                return False
            feeds.append(feed)
        # The bridge accepts at most 1,000 candles per symbol, across four frames.
        # Seed longer history once in bounded batches, newest first. A failed batch
        # never marks the account seeded; durable upsert identities make retry safe.
        frames = [{tf:sorted((c for c in feed['candles'] if c['timeframe'] == tf), key=lambda c:c['open_time']) for tf in SCANNER_TIMEFRAMES} for feed in feeds]
        batches = max(math.ceil(len(rows)/BARS_PER_FRAME_BATCH) for group in frames for rows in group.values()) if bootstrap else 1
        for index in range(batches):
            payload = []
            for feed, group in zip(feeds, frames):
                candles = []
                for tf, rows in group.items():
                    end = len(rows)-index*BARS_PER_FRAME_BATCH
                    chunk = rows[max(0,end-BARS_PER_FRAME_BATCH):max(0,end)] if bootstrap else rows
                    if len(chunk) < ROUTINE_BARS:
                        merged = {c['open_time']:c for c in rows[-ROUTINE_BARS:] + chunk}
                        chunk = sorted(merged.values(), key=lambda c:c['open_time'])
                    candles.extend(chunk)
                payload.append({**feed, 'candles':candles})
            if not self.cloud_client.publish_market_data(account_id, payload):
                logger.warning('operation=market_data_publish batch=%s error_code=MT5_MARKET_DATA_PUBLISH_FAILED', index)
                return False
        self._seeded_accounts.add(account_id)
        logger.info('operation=market_data_publish feeds=%s history_seed=%s batches=%s error_code=NONE', len(feeds), bootstrap, batches)
        return True
