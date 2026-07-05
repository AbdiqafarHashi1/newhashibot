# MARKET_DATA_ENGINE

The current market data engine is mock-only. Crypto and forex fake feeds emit `MarketTickReceived` events through the in-memory event bus. No Binance, Bybit, TwelveData, MT5, or live WebSocket connection is opened in this phase.
