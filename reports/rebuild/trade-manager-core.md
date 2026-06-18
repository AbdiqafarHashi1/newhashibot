# Trade Manager Core

Every 30-60 seconds the trade manager must fetch wallet, positions, and open orders for Binance and Bybit; detect missing SL, TP1, TP2, stale trades, and invalid trades; repair missing protection where testnet policy allows; apply profit lock after TP1; write truth to the database; and alert admin Telegram.
