"""
HashiBot MT5 Agent - MetaTrader 5 Terminal Interface
Handles connection, account queries, order execution, position modifications, symbol specifications, and broker retcode classification.
"""

import sys
import math
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from logging_config import logger

try:
    import MetaTrader5 as mt5
    HAS_MT5 = True
except ImportError:
    mt5 = None
    HAS_MT5 = False
    logger.warning("MetaTrader5 library not detected or running on non-Windows system.")

RETCODE_MAP = {
    10009: {"category": "success", "comment": "Trade request done"},
    10008: {"category": "success", "comment": "Trade request placed"},
    10004: {"category": "terminal_rejected", "comment": "Requote"},
    10006: {"category": "terminal_rejected", "comment": "Request rejected"},
    10013: {"category": "validation_failed", "comment": "Invalid request"},
    10014: {"category": "validation_failed", "comment": "Invalid volume"},
    10015: {"category": "validation_failed", "comment": "Invalid price"},
    10016: {"category": "validation_failed", "comment": "Invalid stops"},
    10018: {"category": "market_closed", "comment": "Market is closed"},
    10019: {"category": "insufficient_margin", "comment": "No money / insufficient margin"},
    10021: {"category": "idempotent_noop", "comment": "No changes"},
}

class MT5Client:
    def __init__(self, terminal_path: Optional[str] = None):
        self.terminal_path = terminal_path
        self.is_connected = False
        self.account_number: Optional[int] = None
        self.broker: str = "Unknown"
        self.server: str = "Unknown"

    @staticmethod
    def classify_retcode(retcode: int) -> Dict[str, Any]:
        info = RETCODE_MAP.get(retcode, {"category": "unknown_error", "comment": f"Retcode {retcode}"})
        return {
            "retcode": retcode,
            "category": info["category"],
            "comment": info["comment"],
            "is_success": info["category"] == "success"
        }

    @staticmethod
    def normalize_volume(volume: float, vol_min: float = 0.01, vol_max: float = 100.0, vol_step: float = 0.01) -> float:
        if volume < vol_min:
            volume = vol_min
        if volume > vol_max:
            volume = vol_max
        steps = math.floor((volume - vol_min) / vol_step + 1e-9)
        normalized = vol_min + steps * vol_step
        return round(normalized, 4)

    def initialize(self, login: Optional[int] = None, password: Optional[str] = None, server: Optional[str] = None, portable: bool = False) -> bool:
        if not HAS_MT5:
            logger.warning("[MT5Client] MetaTrader5 package unavailable.")
            self.is_connected = False
            return False

        if self.terminal_path and not Path(self.terminal_path).is_file():
            logger.error("operation=terminal_initialize error_code=TERMINAL_NOT_FOUND")
            return False
        init_kwargs = {"portable": portable}
        if self.terminal_path:
            init_kwargs["path"] = self.terminal_path

        if not mt5.initialize(**init_kwargs):
            err = mt5.last_error()
            logger.error("operation=terminal_initialize error_code=MT5_INITIALIZE_FAILED")
            self.is_connected = False
            return False

        if login and password and server:
            if not mt5.login(login=login, password=password, server=server):
                err = mt5.last_error()
                logger.error("operation=terminal_login error_code=MT5_LOGIN_FAILED")
                self.is_connected = False
                return False

        account_info = mt5.account_info()
        if account_info is None:
            logger.error("[MT5Client] Failed to retrieve account info after initialization.")
            self.is_connected = False
            return False

        self.account_number = account_info.login
        self.broker = account_info.company
        self.server = account_info.server
        self.is_connected = True
        logger.info("operation=terminal_login error_code=NONE authenticated=true")
        return True

    def check_connection(self) -> bool:
        if not HAS_MT5 or not self.is_connected:
            return False

        term_info = mt5.terminal_info()
        acc_info = mt5.account_info()
        if term_info is None or acc_info is None or not term_info.connected:
            self.is_connected = False
            return False

        self.is_connected = True
        return True

    def get_account_info(self) -> Dict[str, Any]:
        if not HAS_MT5 or not self.check_connection():
            return {
                "login": self.account_number or 0,
                "broker": self.broker,
                "server": self.server,
                "balance": 0.0,
                "equity": 0.0,
                "margin": 0.0,
                "free_margin": 0.0,
                "profit": 0.0,
                "currency": "USD",
                "leverage": 100,
                "connected": False
            }

        acc = mt5.account_info()
        return {
            "login": acc.login,
            "hedging": acc.margin_mode == mt5.ACCOUNT_MARGIN_MODE_RETAIL_HEDGING,
            "environment": "demo" if acc.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO else "live",
            "broker": acc.company,
            "server": acc.server,
            "balance": float(acc.balance),
            "equity": float(acc.equity),
            "margin": float(acc.margin),
            "free_margin": float(acc.margin_free),
            "profit": float(acc.profit),
            "currency": acc.currency,
            "leverage": acc.leverage,
            "name": acc.name,
            "margin_level": float(acc.margin_level),
            "trade_allowed": bool(acc.trade_allowed),
            "trade_expert": bool(acc.trade_expert),
            "connected": True
        }

    def get_terminal_info(self) -> Dict[str, Any]:
        if not HAS_MT5 or not self.is_connected:
            return {"connected": False, "version": "unknown", "build": 0}

        t = mt5.terminal_info()
        if t is None:
            return {"connected": False, "version": "unknown", "build": 0}

        return {
            "connected": t.connected,
            "community_account": t.community_account,
            "community_connection": t.community_connection,
            "trade_allowed": t.trade_allowed,
            "autotrading": bool(t.trade_allowed),
            "path": t.path,
            "data_path": t.data_path,
            "build": t.build,
            "name": t.name
        }

    def get_market_data(self, canonical_symbol: str, broker_symbol: str, timeframes: List[str], bars: int = 140) -> Dict[str, Any]:
        """Read broker ticks/specification/candles; never fabricate unavailable bars."""
        if not HAS_MT5 or not self.check_connection():
            raise RuntimeError("MT5_MARKET_DATA_UNAVAILABLE")
        info, tick = mt5.symbol_info(broker_symbol), mt5.symbol_info_tick(broker_symbol)
        if info is None or tick is None or float(tick.bid) <= 0 or float(tick.ask) <= 0:
            raise RuntimeError("MT5_MARKET_DATA_UNAVAILABLE")
        frame_map = {"1m": mt5.TIMEFRAME_M1, "5m": mt5.TIMEFRAME_M5, "15m": mt5.TIMEFRAME_M15,
                     "30m": mt5.TIMEFRAME_M30, "1h": mt5.TIMEFRAME_H1, "4h": mt5.TIMEFRAME_H4, "1d": mt5.TIMEFRAME_D1}
        candles = []
        for timeframe in timeframes:
            if timeframe not in frame_map:
                raise ValueError("MT5_TIMEFRAME_UNSUPPORTED")
            rows = mt5.copy_rates_from_pos(broker_symbol, frame_map[timeframe], 0, bars)
            if rows is None:
                continue
            candles.extend({"timeframe": timeframe, "open_time": datetime.utcfromtimestamp(int(r["time"])).isoformat()+"Z",
                            "open": float(r["open"]), "high": float(r["high"]), "low": float(r["low"]),
                            "close": float(r["close"]), "tick_volume": int(r["tick_volume"])} for r in rows if float(r["open"]) > 0)
        return {"canonical_symbol": canonical_symbol, "broker_symbol": broker_symbol, "bid": float(tick.bid), "ask": float(tick.ask),
                "digits": int(info.digits), "point": float(info.point), "tick_size": float(info.trade_tick_size),
                "tick_value": float(info.trade_tick_value), "contract_size": float(info.trade_contract_size),
                "volume_min": float(info.volume_min), "volume_step": float(info.volume_step), "volume_max": float(info.volume_max),
                "stops_level": int(info.trade_stops_level), "freeze_level": int(info.trade_freeze_level),
                "market_open": bool(info.visible and tick.time), "last_update_at": datetime.utcfromtimestamp(int(tick.time)).isoformat()+"Z", "candles": candles}

    def get_historical_bars(self, canonical_symbol: str, timeframe: str, from_iso: str, to_iso: str, source_symbol: Optional[str] = None) -> Dict[str, Any]:
        """Read an explicit UTC range from the authenticated terminal; no generated fallback."""
        if not HAS_MT5 or not self.check_connection():
            raise RuntimeError("MT5_HISTORY_UNAVAILABLE")
        frame_map = {"1m": mt5.TIMEFRAME_M1, "5m": mt5.TIMEFRAME_M5, "15m": mt5.TIMEFRAME_M15,
                     "30m": mt5.TIMEFRAME_M30, "1h": mt5.TIMEFRAME_H1, "4h": mt5.TIMEFRAME_H4, "1d": mt5.TIMEFRAME_D1}
        if timeframe not in frame_map:
            raise ValueError("MT5_TIMEFRAME_UNSUPPORTED")
        spec = self.get_symbol_info(source_symbol or canonical_symbol)
        if not spec:
            raise RuntimeError("MT5_SYMBOL_UNAVAILABLE")
        broker_symbol = spec["broker_symbol"]
        start = datetime.fromisoformat(from_iso.replace("Z", "+00:00"))
        end = datetime.fromisoformat(to_iso.replace("Z", "+00:00"))
        if start.tzinfo is None or end.tzinfo is None or end < start or end > datetime.now(timezone.utc) + timedelta(minutes=1):
            raise ValueError("MT5_HISTORY_RANGE_INVALID")
        rows = mt5.copy_rates_range(broker_symbol, frame_map[timeframe], start, end)
        if rows is None:
            raise RuntimeError("MT5_HISTORY_UNAVAILABLE")
        bars = [{"time": int(row["time"]), "open": float(row["open"]), "high": float(row["high"]),
                 "low": float(row["low"]), "close": float(row["close"]), "tick_volume": int(row["tick_volume"]),
                 "spread": int(row["spread"]), "real_volume": int(row["real_volume"])} for row in rows]
        return {"version": "1.0", "provider": "MT5", "broker": self.broker, "server": self.server,
                "canonical_symbol": canonical_symbol, "source_symbol": broker_symbol, "timeframe": timeframe,
                "from": from_iso, "to": to_iso, "bars": bars}

    def verify_connection(self, requested_login: int, requested_broker: str, requested_server: str) -> Dict[str, Any]:
        """Run the complete read-only certification probe; never submits a trade request."""
        if not self.check_connection():
            return {"ok": False, "blocker": "TERMINAL_DISCONNECTED"}
        account = self.get_account_info()
        terminal = self.get_terminal_info()
        if int(account.get("login", 0)) != int(requested_login):
            return {"ok": False, "blocker": "ACCOUNT_MISMATCH"}
        if requested_broker.casefold() not in str(account.get("broker", "")).casefold():
            return {"ok": False, "blocker": "ACCOUNT_MISMATCH"}
        if requested_server.casefold() != str(account.get("server", "")).casefold():
            return {"ok": False, "blocker": "SERVER_MISMATCH"}
        positions_raw = mt5.positions_get()
        orders_raw = mt5.orders_get()
        history_raw = mt5.history_deals_get(datetime.now() - timedelta(days=30), datetime.now())
        required = ("name", "currency", "balance", "equity", "margin", "free_margin")
        if positions_raw is None or orders_raw is None or history_raw is None or any(account.get(k) is None for k in required):
            return {"ok": False, "blocker": "MT5_SNAPSHOT_FAILED"}
        return {
            "ok": True, "blocker": None, "account": account, "terminal": terminal,
            "positions_read": True, "orders_read": True, "history_read": True,
            "positions_count": len(positions_raw), "orders_count": len(orders_raw),
        }

    def get_history(self, days: int = 30) -> Optional[List[Dict[str, Any]]]:
        self.last_history_range = None
        if not HAS_MT5 or not self.check_connection():
            return None
        history_to = datetime.now(timezone.utc)
        history_from = history_to - timedelta(days=days)
        rows = mt5.history_deals_get(history_from, history_to)
        if rows is None:
            return None
        self.last_history_range = {"from": history_from.isoformat(), "to": history_to.isoformat()}
        return [{"ticket": str(d.ticket), "order": str(d.order), "symbol": d.symbol,
                 "type": int(d.type), "comment": str(getattr(d,"comment","")), "volume": float(d.volume), "price": float(d.price),
                 "profit": float(d.profit), "commission": float(d.commission), "swap": float(d.swap), "fee": float(d.fee), "entry": int(d.entry), "position_id": str(d.position_id), "time": int(d.time)} for d in rows]

    def get_positions(self) -> List[Dict[str, Any]]:
        if not HAS_MT5 or not self.check_connection():
            raise RuntimeError("MT5_POSITIONS_UNAVAILABLE")

        pos_list = mt5.positions_get()
        if pos_list is None:
            raise RuntimeError("MT5_POSITIONS_UNAVAILABLE")

        result = []
        for p in pos_list:
            side = "buy" if p.type == mt5.ORDER_TYPE_BUY else "sell"
            result.append({
                "ticket": str(p.ticket),
                "symbol": p.symbol,
                "side": side,
                "quantity": float(p.volume),
                "entry_price": float(p.price_open),
                "current_price": float(p.price_current),
                "sl": float(p.sl) if p.sl else None,
                "tp": float(p.tp) if p.tp else None,
                "unrealized_pnl": float(p.profit),
                "magic": p.magic,
                "comment": p.comment,
                "time": p.time
            })
        return result

    def get_orders(self) -> List[Dict[str, Any]]:
        if not HAS_MT5 or not self.check_connection():
            raise RuntimeError("MT5_ORDERS_UNAVAILABLE")

        order_list = mt5.orders_get()
        if order_list is None:
            raise RuntimeError("MT5_ORDERS_UNAVAILABLE")

        result = []
        for o in order_list:
            order_type_str = "buy_limit"
            if o.type == mt5.ORDER_TYPE_BUY_LIMIT:
                order_type_str = "buy_limit"
            elif o.type == mt5.ORDER_TYPE_SELL_LIMIT:
                order_type_str = "sell_limit"
            elif o.type == mt5.ORDER_TYPE_BUY_STOP:
                order_type_str = "buy_stop"
            elif o.type == mt5.ORDER_TYPE_SELL_STOP:
                order_type_str = "sell_stop"

            result.append({
                "ticket": str(o.ticket),
                "symbol": o.symbol,
                "type": order_type_str,
                "quantity": float(o.volume_initial),
                "price": float(o.price_open),
                "sl": float(o.sl) if o.sl else None,
                "tp": float(o.tp) if o.tp else None,
                "state": o.state,
                "magic": o.magic
            })
        return result

    def get_symbol_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        if not HAS_MT5 or not self.check_connection():
            return None

        if mt5.symbol_info(symbol) is None:
            matches = [row.name for row in (mt5.symbols_get() or ()) if row.name.startswith(symbol) and row.currency_base + row.currency_profit == symbol]
            if len(matches) != 1:
                return None
            symbol = matches[0]
        if not mt5.symbol_select(symbol, True):
            return None

        s = mt5.symbol_info(symbol)
        if s is None:
            return None

        tick = mt5.symbol_info_tick(symbol)
        account = mt5.account_info()
        conversion = None
        if account and s.currency_profit == account.currency:
            conversion = 1.0
        elif account:
            for pair, inverse in ((s.currency_profit + account.currency, False), (account.currency + s.currency_profit, True)):
                pair_info = mt5.symbol_info(pair)
                if pair_info is None:
                    matches = [row.name for row in (mt5.symbols_get() or ()) if row.name.startswith(pair) and row.currency_base + row.currency_profit == pair]
                    if len(matches) == 1:
                        pair = matches[0]
                if mt5.symbol_select(pair, True):
                    quote = mt5.symbol_info_tick(pair)
                    if quote and quote.bid > 0 and quote.ask > 0 and 0 <= datetime.now(timezone.utc).timestamp() - quote.time <= 60:
                        conversion = 1.0 / float(quote.bid) if inverse else float(quote.ask)
                        break
        return {
            "tick_size": float(s.trade_tick_size), "tick_value": float(s.trade_tick_value),
            "currency_profit": s.currency_profit, "account_currency": account.currency if account else None,
            "quote_to_account_conversion": conversion,
            "tick_at": datetime.fromtimestamp(tick.time, timezone.utc).isoformat() if tick else None,
            "trade_mode": int(s.trade_mode),
            "broker_symbol": s.name,
            "digits": int(s.digits),
            "point": float(s.point),
            "contract_size": float(s.trade_contract_size),
            "volume_min": float(s.volume_min),
            "volume_max": float(s.volume_max),
            "volume_step": float(s.volume_step),
            "stops_level_points": int(s.trade_stops_level),
            "bid": float(s.bid),
            "ask": float(s.ask),
            "spread": int(s.spread),
            "fill_policies": (["fok"] if int(s.filling_mode) & 1 else []) + (["ioc"] if int(s.filling_mode) & 2 else []) + (["return"] if int(s.trade_exemode) != int(mt5.SYMBOL_TRADE_EXECUTION_MARKET) else [])
        }

    def assert_demo_execution_identity(self):
        from config import Config
        account = mt5.account_info() if HAS_MT5 else None
        if Config.DATA_ONLY or account is None or account.login != Config.ACCOUNT_NUMBER or account.server != Config.SERVER or account.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
            raise RuntimeError("MT5_MUTATION_TERMINAL_SCOPE_MISMATCH")

    def place_order(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not HAS_MT5 or not self.check_connection():
            return {"success": False, "error": "MT5 terminal not connected", "error_code": "TERMINAL_DISCONNECTED"}

        symbol = payload.get("symbol", "")
        side = payload.get("side", "buy").lower()
        raw_volume = float(payload.get("volume", payload.get("quantity", 0)))
        price = payload.get("price")
        sl = payload.get("sl", payload.get("stopLoss", payload.get("stop_loss")))
        tp = payload.get("tp", payload.get("takeProfit", payload.get("take_profit_2")))
        action_type = payload.get("action", payload.get("order_type", "market")).lower()
        comment = payload.get("comment", "HashiBot Trade")
        magic = int(payload.get("magic", 888111))

        s_info = self.get_symbol_info(symbol)
        if not s_info:
            return {"success": False, "error": f"Symbol {symbol} unavailable", "error_code": "SYMBOL_UNAVAILABLE"}

        volume = self.normalize_volume(raw_volume, s_info["volume_min"], s_info["volume_max"], s_info["volume_step"])
        if abs(volume - raw_volume) > 1e-9 or raw_volume <= 0:
            return {"success": False, "error_code": "APPROVED_VOLUME_NOT_PROVIDER_EXACT"}
        symbol = s_info["broker_symbol"]
        digits = s_info["digits"]

        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return {"success": False, "error": f"Failed to fetch tick for {symbol}", "error_code": "TICK_UNAVAILABLE"}

        if action_type in ["market", "deal"]:
            trade_action = mt5.TRADE_ACTION_DEAL
            mt5_type = mt5.ORDER_TYPE_BUY if side in ["buy", "long"] else mt5.ORDER_TYPE_SELL
            exec_price = tick.ask if side in ["buy", "long"] else tick.bid
        else:
            trade_action = mt5.TRADE_ACTION_PENDING
            if side in ["buy", "long"]:
                mt5_type = mt5.ORDER_TYPE_BUY_LIMIT if price and float(price) < tick.ask else mt5.ORDER_TYPE_BUY_STOP
            else:
                mt5_type = mt5.ORDER_TYPE_SELL_LIMIT if price and float(price) > tick.bid else mt5.ORDER_TYPE_SELL_STOP
            exec_price = float(price) if price else (tick.ask if side in ["buy", "long"] else tick.bid)

        if sl is None or float(sl) <= 0 or tp is None or float(tp) <= 0:
            return {"success": False, "error_code": "ATTACHED_SL_TP_REQUIRED"}
        fill_name = str(payload.get("fill_policy", "IOC")).lower()
        if fill_name not in s_info["fill_policies"] or fill_name not in ("ioc", "fok"):
            return {"success": False, "error_code": "APPROVED_FILL_POLICY_UNAVAILABLE"}
        request = {
            "action": trade_action,
            "symbol": symbol,
            "volume": volume,
            "type": mt5_type,
            "price": round(exec_price, digits),
            "magic": magic,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC if fill_name == "ioc" else mt5.ORDER_FILLING_FOK,
        }

        if sl is not None and float(sl) > 0:
            request["sl"] = (math.ceil(float(sl) / s_info["tick_size"] - 1e-9) if side in ["buy", "long"] else math.floor(float(sl) / s_info["tick_size"] + 1e-9)) * s_info["tick_size"]
            request["sl"] = round(request["sl"], digits)
        if tp is not None and float(tp) > 0:
            request["tp"] = round(float(tp), digits)

        self.assert_demo_execution_identity()
        result = mt5.order_send(request)
        if result is None:
            err = mt5.last_error()
            return {"success": False, "error": f"order_send returned None: {err}", "error_code": "ORDER_SEND_FAILED"}

        ret_info = self.classify_retcode(result.retcode)
        if not ret_info["is_success"]:
            return {
                "success": False,
                "error": f"Trade error {result.retcode}: {result.comment}",
                "error_code": ret_info["category"],
                "retcode": result.retcode,
                "comment": result.comment
            }

        source_deals = mt5.history_deals_get(ticket=int(result.order))
        position_ids = {str(d.position_id) for d in (source_deals or ()) if d.position_id}
        provider_position_id = next(iter(position_ids)) if len(position_ids) == 1 else None
        logger.info(f"[MT5Client] Order placed successfully: Ticket #{result.order}, Volume: {result.volume}, Price: {result.price}")
        return {
            "success": True,
            "ticket": str(result.order),
            "deal_ticket": str(result.deal),
            "provider_order_id": str(result.order),
            "provider_position_id": provider_position_id,
            "executed_price": float(result.price),
            "executed_volume": float(result.volume),
            "retcode": result.retcode,
            "comment": result.comment
        }

    def position_deals(self, ticket: str) -> List[Dict[str, Any]]:
        if not HAS_MT5 or not self.check_connection():
            raise RuntimeError("MT5_HISTORY_UNAVAILABLE")
        rows = mt5.history_deals_get(position=int(ticket))
        if rows is None:
            raise RuntimeError("MT5_HISTORY_UNAVAILABLE")
        return [{**r._asdict(), "is_exit": r.entry == mt5.DEAL_ENTRY_OUT, "is_tp_exit": r.entry == mt5.DEAL_ENTRY_OUT and r.reason == mt5.DEAL_REASON_TP} for r in rows]

    def modify_position(self, ticket: str, sl: Optional[float] = None, tp: Optional[float] = None) -> Dict[str, Any]:
        if not HAS_MT5 or not self.check_connection():
            return {"success": False, "error": "MT5 terminal not connected", "error_code": "TERMINAL_DISCONNECTED"}

        try:
            int_ticket = int(ticket)
        except ValueError:
            return {"success": False, "error": f"Invalid ticket format: {ticket}", "error_code": "INVALID_TICKET"}

        positions = mt5.positions_get(ticket=int_ticket)
        if not positions:
            return {"success": False, "error": f"Position ticket #{ticket} not found", "error_code": "POSITION_NOT_FOUND"}

        pos = positions[0]
        s_info = self.get_symbol_info(pos.symbol)
        digits = s_info["digits"] if s_info else 5

        new_sl = round(float(sl), digits) if sl is not None else float(pos.sl)
        new_tp = round(float(tp), digits) if tp is not None else float(pos.tp)

        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": pos.ticket,
            "symbol": pos.symbol,
            "sl": new_sl,
            "tp": new_tp,
        }

        self.assert_demo_execution_identity()
        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": "Modify order_send returned None", "error_code": "MODIFY_FAILED"}

        ret_info = self.classify_retcode(result.retcode)
        if not ret_info["is_success"]:
            return {"success": False, "error": f"Modify failed: {result.comment}", "error_code": ret_info["category"], "retcode": result.retcode}

        logger.info(f"[MT5Client] Position #{ticket} modified successfully: SL={new_sl}, TP={new_tp}")
        return {"success": True, "ticket": ticket, "sl": new_sl, "tp": new_tp, "retcode": result.retcode}

    def close_position(self, ticket: str, volume: Optional[float] = None) -> Dict[str, Any]:
        if not HAS_MT5 or not self.check_connection():
            return {"success": False, "error": "MT5 terminal not connected", "error_code": "TERMINAL_DISCONNECTED"}

        try:
            int_ticket = int(ticket)
        except ValueError:
            return {"success": False, "error": f"Invalid ticket format: {ticket}", "error_code": "INVALID_TICKET"}

        positions = mt5.positions_get(ticket=int_ticket)
        if not positions:
            return {"success": False, "error": f"Position ticket #{ticket} not found", "error_code": "POSITION_NOT_FOUND"}

        pos = positions[0]
        s_info = self.get_symbol_info(pos.symbol)

        close_volume = float(volume) if volume and float(volume) > 0 else float(pos.volume)
        if s_info:
            close_volume = self.normalize_volume(close_volume, s_info["volume_min"], s_info["volume_max"], s_info["volume_step"])

        close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY

        tick = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            return {"success": False, "error": f"Tick for {pos.symbol} unavailable", "error_code": "TICK_UNAVAILABLE"}

        close_price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask
        digits = s_info["digits"] if s_info else 5

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": pos.ticket,
            "symbol": pos.symbol,
            "volume": close_volume,
            "type": close_type,
            "price": round(close_price, digits),
            "magic": pos.magic,
            "comment": "HashiBot Close",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        self.assert_demo_execution_identity()
        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": "Close order_send returned None", "error_code": "CLOSE_FAILED"}

        ret_info = self.classify_retcode(result.retcode)
        if not ret_info["is_success"]:
            return {"success": False, "error": f"Close failed: {result.comment}", "error_code": ret_info["category"], "retcode": result.retcode}

        logger.info(f"[MT5Client] Position #{ticket} closed successfully: Volume={close_volume} at {close_price}")
        return {"success": True, "ticket": ticket, "closed_volume": close_volume, "price": close_price, "retcode": result.retcode}

    def cancel_order(self, ticket: str) -> Dict[str, Any]:
        if not HAS_MT5 or not self.check_connection():
            return {"success": False, "error": "MT5 terminal not connected", "error_code": "TERMINAL_DISCONNECTED"}

        try:
            int_ticket = int(ticket)
        except ValueError:
            return {"success": False, "error": f"Invalid ticket format: {ticket}", "error_code": "INVALID_TICKET"}

        request = {
            "action": mt5.TRADE_ACTION_REMOVE,
            "order": int_ticket,
        }

        self.assert_demo_execution_identity()
        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": "Cancel order_send returned None", "error_code": "CANCEL_FAILED"}

        ret_info = self.classify_retcode(result.retcode)
        if not ret_info["is_success"]:
            return {"success": False, "error": f"Cancel order failed: {result.comment}", "error_code": ret_info["category"], "retcode": result.retcode}

        logger.info(f"[MT5Client] Pending order #{ticket} cancelled successfully")
        return {"success": True, "ticket": ticket, "retcode": result.retcode}
