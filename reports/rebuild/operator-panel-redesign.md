# Operator Panel Redesign

The admin UI is consolidated into six runtime-truth sections: Dashboard, Signals, Executions, Trade Manager, Telegram, and Settings. Legacy pages are preserved as compatibility/deprecated routes so current scanner, Telegram delivery, Binance monitor, database history, and strategy logic remain untouched.

The new panel polls live state every 5 seconds and labels key subsystems as LIVE, STALE, FAILED, or DISABLED. Mobile behavior is card-first with a sticky critical status bar; desktop uses grid cards and comparison panels.
