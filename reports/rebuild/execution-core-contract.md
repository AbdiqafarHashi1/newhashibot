# Execution Core Contract

Signals produce one provider-neutral trade plan containing symbol, side, entry, risk, SL, TP1, TP2, and profit-lock requirements. Binance and Bybit consume the same plan as mirrored providers.

Each provider execution truth record must include provider, symbol, order id, status, blocker, entry order, SL order, TP1 order, TP2 order, latest sync, and latest error. Live trading remains disabled; proofs and execution are testnet/paper only.
