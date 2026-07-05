# MARKET_DATA_ENGINE

The current V2 market data engine remains mock-source only, but its contract is hardened for future Binance, Bybit, and MT5 adapters without connecting to them.

`MarketTickReceived` supports crypto and forex ticks with price, bid, ask, spread, exchange volume, tick volume, provider, source, occurred/latency/received timestamps, market status, and feed health. Mock feeds populate the full contract and publish through the in-memory event bus.

Live adapters must map provider payloads into this contract and must not bypass the candle engine or write runtime market data to storage.
