"""Signal-only mathematical research framework; NOT a certified deployed scanner.

No network, orders, account routing, Redis, ZeroMQ or Telegram calls. The active
TypeScript scanner remains authoritative. Legacy code is preserved under legacy/.
Candles: numpy rows [UTC open epoch seconds, open, high, low, close, volume,
optional native taker-buy volume]. Never synthesize the last column from OHLC.
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import numpy as np

PAYLOAD_KEYS = {"ticker", "strategy", "action", "entry", "sl", "tp", "signal_intensity", "regime"}


def admit(a: np.ndarray, seconds: int, asof: float, minimum: int = 30) -> None:
    if not isinstance(a, np.ndarray) or a.ndim != 2 or a.shape[0] < minimum or a.shape[1] < 6:
        raise ValueError("INSUFFICIENT_NATIVE_CANDLES")
    if not math.isfinite(asof) or seconds <= 0 or not np.isfinite(a[:, :6]).all():
        raise ValueError("NONFINITE_DATA")
    if (a[:, 3] <= 0).any() or (a[:, 5] < 0).any() or (a[:, 3] > np.minimum(a[:, 1], a[:, 4])).any() or (a[:, 2] < np.maximum(a[:, 1], a[:, 4])).any():
        raise ValueError("INVALID_OHLCV")
    if (np.diff(a[:, 0]) != seconds).any() or a[-1, 0] + seconds > asof:
        raise ValueError("OPEN_GAPPED_OR_DUPLICATE_DATA")
    if asof - a[-1, 0] - seconds > seconds:
        raise ValueError("STALE_DATA")


def atr14(a: np.ndarray) -> float:
    if len(a) < 15:
        raise ValueError("ATR_WARMUP")
    tr = np.maximum(a[1:, 2] - a[1:, 3], np.maximum(abs(a[1:, 2] - a[:-1, 4]), abs(a[1:, 3] - a[:-1, 4])))
    value = float(tr[:14].mean())
    for x in tr[14:]:
        value = (13 * value + float(x)) / 14
    if not math.isfinite(value) or value <= 0:
        raise ValueError("INVALID_ATR")
    return value


def ema(a: np.ndarray, period: int = 20) -> float:
    value = float(a[0])
    for x in a[1:]:
        value += 2 / (period + 1) * (float(x) - value)
    return value


def rsi2(a: np.ndarray) -> float:
    d = np.diff(a)
    if len(d) < 2:
        raise ValueError("RSI_WARMUP")
    gain, loss = float(np.maximum(d[:2], 0).mean()), float(np.maximum(-d[:2], 0).mean())
    for x in d[2:]:
        gain, loss = (gain + max(float(x), 0)) / 2, (loss + max(-float(x), 0)) / 2
    return 50. if gain == loss == 0 else 100. if loss == 0 else 100 - 100 / (1 + gain / loss)


def pivots(a: np.ndarray, column: int) -> list[int]:
    """Two already-closed candles on each side; no unconfirmed pivot lookahead."""
    x = a[:, column]
    return [i for i in range(2, len(a) - 2) if all(x[i] < x[j] if column == 3 else x[i] > x[j]
            for j in range(i - 2, i + 3) if i != j)]


def h1_structure(a: np.ndarray) -> str:
    lows, highs = pivots(a, 3), pivots(a, 2)
    if len(lows) < 2 or len(highs) < 2:
        return "UNKNOWN"
    if a[lows[-1], 3] > a[lows[-2], 3] and a[highs[-1], 2] > a[highs[-2], 2]:
        return "UP"
    if a[lows[-1], 3] < a[lows[-2], 3] and a[highs[-1], 2] < a[highs[-2], 2]:
        return "DOWN"
    return "MIXED"


@dataclass(frozen=True)
class NewsCalendar:
    events: tuple[tuple[float, tuple[str, ...], str], ...]
    observed_at: float
    covered_from: float
    covered_until: float
    source: str


@dataclass(frozen=True)
class Funding:
    rate: float  # Fraction per8h: 0.0005 =5bps. Not a percentage number.
    observed_at: float
    source: str
    interval_hours: int = 8


@dataclass(frozen=True)
class VolumeProfile:
    bins: np.ndarray  # [lower price, upper price, actual traded volume]
    from_at: float
    until_at: float
    observed_at: float
    source: str
    actual_traded_volume: bool


@dataclass(frozen=True)
class SignalContext:
    ticker: str
    market: str  # FOREX / CRYPTO
    bars: np.ndarray
    h1: np.ndarray
    asof: float
    source: str
    seconds: int = 300
    instrument: str = "PERPETUAL"  # Explicit SPOT skips funding only.
    currencies: tuple[str, ...] = ()
    pip_size: float | None = None
    news: NewsCalendar | None = None
    funding: Funding | None = None
    h4: np.ndarray = field(default_factory=lambda: np.empty((0, 6)))
    profile: VolumeProfile | None = None


@dataclass(frozen=True)
class Settings:
    funding_extreme: float = .0005
    funding_max_age: int = 1800
    news_max_age: int = 86400
    max_bars: int = 12
    crypto_trail_atr: float = 4.

    def __post_init__(self):
        if not all(math.isfinite(x) and x > 0 for x in (self.funding_extreme, self.funding_max_age, self.news_max_age, self.max_bars, self.crypto_trail_atr)) or not isinstance(self.max_bars, int):
            raise ValueError("INVALID_SETTINGS")


@dataclass(frozen=True)
class Setup:
    action: str
    entry: float
    intensity: float
    regime: str
    structural_target: float | None = None
    entry_kind: str = "NEXT_OPEN"


@dataclass(frozen=True)
class Evaluation:
    payload: dict | None
    reasons: tuple[str, ...]
    asof: float
    seconds: int
    atr: float = 0.
    market: str = ""
    entry_kind: str = "NEXT_OPEN"


class SignalStrategy:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or Settings()

    def series(self, ctx):
        return ctx.bars, ctx.seconds

    def setup(self, ctx, bars):
        raise NotImplementedError

    def evaluate(self, ctx: SignalContext) -> Evaluation:
        bars, seconds = self.series(ctx)
        blank = lambda reason: Evaluation(None, (reason,), ctx.asof, seconds)
        try:
            if ctx.market not in ("FOREX", "CRYPTO") or not ctx.ticker or not ctx.source:
                raise ValueError("MARKET_IDENTITY_REQUIRED")
            admit(bars, seconds, ctx.asof)
            admit(ctx.h1, 3600, ctx.asof)
            if ctx.asof != bars[-1, 0] + seconds:
                raise ValueError("EVALUATE_AT_CANDLE_CLOSE_REQUIRED")
            if ctx.market == "FOREX":
                self.news_gate(ctx)
            setup = self.setup(ctx, bars)
            if setup is None:
                return blank("NO_SETUP")
            if setup.action not in ("BUY", "SELL") or setup.entry_kind not in ("NEXT_OPEN", "LIMIT") or not math.isfinite(setup.intensity) or not 0 <= setup.intensity <= 1:
                raise ValueError("INVALID_SETUP")
            if h1_structure(ctx.h1) != ("UP" if setup.action == "BUY" else "DOWN"):
                raise ValueError("H1_STRUCTURE_NOT_ALIGNED")
            self.funding_gate(ctx, setup.action)
            atr, sign = atr14(bars), 1 if setup.action == "BUY" else -1
            slx, tpx = (1.5, 3.) if ctx.market == "FOREX" else (2., 4.)
            sl, tp = setup.entry - sign * slx * atr, setup.entry + sign * tpx * atr
            if setup.structural_target is not None and (not math.isfinite(setup.structural_target) or sign * (setup.structural_target - tp) < 0):
                raise ValueError("STRUCTURAL_ROOM_BELOW_ATR_TARGET")
            if not all(math.isfinite(x) and x > 0 for x in (setup.entry, sl, tp)):
                raise ValueError("INVALID_PRICE_GEOMETRY")
            payload = dict(ticker=ctx.ticker, strategy=type(self).__name__, action=setup.action,
                           entry=float(setup.entry), sl=float(sl), tp=float(tp),
                           signal_intensity=float(setup.intensity), regime=setup.regime)
            return Evaluation(payload, (), ctx.asof, seconds, atr, ctx.market, setup.entry_kind)
        except (ValueError, TypeError, IndexError, AttributeError, OverflowError) as error:
            return blank(str(error) if isinstance(error, ValueError) else "MALFORMED_INPUT")

    def generate(self, ctx: SignalContext) -> dict | None:
        """Strict payload; use evaluate() to retain LIMIT and lifecycle metadata."""
        return self.evaluate(ctx).payload

    def news_gate(self, ctx):
        n = ctx.news
        if n is None or not n.source or not ctx.currencies:
            raise ValueError("NEWS_COVERAGE_REQUIRED")
        if not all(math.isfinite(x) for x in (n.observed_at, n.covered_from, n.covered_until)) or not (n.observed_at <= ctx.asof <= n.observed_at + self.settings.news_max_age and n.covered_from <= ctx.asof - 3600 and n.covered_until >= ctx.asof + 3600):
            raise ValueError("NEWS_COVERAGE_STALE_OR_INCOMPLETE")
        for at, currencies, impact in n.events:
            if not math.isfinite(at):
                raise ValueError("INVALID_NEWS_TIME")
            if impact.upper() == "HIGH" and set(currencies).intersection(ctx.currencies) and abs(at - ctx.asof) <= 3600:
                raise ValueError("HIGH_IMPACT_NEWS_LOCKOUT")

    def funding_gate(self, ctx, action):
        if ctx.market != "CRYPTO" or ctx.instrument == "SPOT":
            return
        f = ctx.funding
        if ctx.instrument != "PERPETUAL" or f is None or not f.source or f.interval_hours != 8 or not math.isfinite(f.rate) or not math.isfinite(f.observed_at):
            raise ValueError("NATIVE_8H_FUNDING_REQUIRED")
        if not f.observed_at <= ctx.asof <= f.observed_at + self.settings.funding_max_age:
            raise ValueError("FUNDING_STALE_OR_FUTURE")
        if (action == "BUY" and f.rate >= self.settings.funding_extreme) or (action == "SELL" and f.rate <= -self.settings.funding_extreme):
            raise ValueError("CROWDED_FUNDING_DIRECTION")


class SessionLiquiditySweep(SignalStrategy):
    def setup(self, ctx, a):
        if ctx.market != "FOREX" or ctx.seconds != 300:
            return None
        if ctx.pip_size is None or not math.isfinite(ctx.pip_size) or ctx.pip_size <= 0:
            raise ValueError("EXPLICIT_PIP_SIZE_REQUIRED")
        now = datetime.fromtimestamp(ctx.asof, timezone.utc)
        if not 8 <= now.astimezone(ZoneInfo("Europe/London")).hour < 10:
            return None
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        asia = a[(a[:, 0] >= midnight) & (a[:, 0] < midnight + 21600)]
        if len(asia) != 72:
            raise ValueError("COMPLETE_ASIAN_SESSION_REQUIRED")
        high, low, last = float(asia[:, 2].max()), float(asia[:, 3].min()), a[-1]
        if low < last[4] < high:
            if 2 <= (low - last[3]) / ctx.pip_size <= 5:
                return Setup("BUY", float(last[4]), .7, "LONDON_SWEEP", high)
            if 2 <= (last[2] - high) / ctx.pip_size <= 5:
                return Setup("SELL", float(last[4]), .7, "LONDON_SWEEP", low)
        return None


def cvd(a: np.ndarray) -> np.ndarray:
    if a.shape[1] < 7 or not np.isfinite(a[:, 6]).all() or (a[:, 6] < 0).any() or (a[:, 6] > a[:, 5]).any():
        raise ValueError("NATIVE_TAKER_VOLUME_REQUIRED")
    return np.cumsum(2 * a[:, 6] - a[:, 5])


class CVDDivergenceEngine(SignalStrategy):
    def setup(self, ctx, a):
        if ctx.market != "CRYPTO":
            return None
        delta = cvd(a)
        for col, action in ((3, "BUY"), (2, "SELL")):
            ps = pivots(a, col)
            if len(ps) >= 2 and ps[-1] == len(a) - 3:
                i, j = ps[-2:]
                if (action == "BUY" and a[j, 3] < a[i, 3] and delta[j] > delta[i]) or (action == "SELL" and a[j, 2] > a[i, 2] and delta[j] < delta[i]):
                    return Setup(action, float(a[-1, 4]), .7, "CVD_DIVERGENCE")
        return None


class MeanReversionExhaustion(SignalStrategy):
    def setup(self, ctx, a):
        if not 15 <= datetime.fromtimestamp(ctx.asof, timezone.utc).astimezone(ZoneInfo("America/New_York")).hour < 17 or a[-1, 5] >= .7 * a[-21:-1, 5].mean():
            return None
        center, sd = float(a[-21:-1, 4].mean()), float(a[-21:-1, 4].std())
        baseline, rsi = ema(a[:, 4]), rsi2(a[:, 4])
        if sd > 0 and a[-1, 2] < center - 2.5 * sd and rsi < 20:
            return Setup("BUY", float(a[-1, 4]), .65, "QUIET_EXHAUSTION", baseline)
        if sd > 0 and a[-1, 3] > center + 2.5 * sd and rsi > 80:
            return Setup("SELL", float(a[-1, 4]), .65, "QUIET_EXHAUSTION", baseline)
        return None


class H4MarketStructureShift(SignalStrategy):
    def series(self, ctx):
        return ctx.h4, 14400

    def setup(self, ctx, a):
        highs, lows = pivots(a[:-1], 2), pivots(a[:-1], 3)
        if not highs or not lows:
            return None
        hi, lo, last = float(a[highs[-1], 2]), float(a[lows[-1], 3]), a[-1]
        if last[4] > hi >= a[-2, 4]:
            entry = float(last[2] - .702 * (last[2] - lo))
            return Setup("BUY", entry, .7, "H4_STRUCTURE_SHIFT", float(last[2]), "LIMIT") if entry < last[4] else None
        if last[4] < lo <= a[-2, 4]:
            entry = float(last[3] + .702 * (hi - last[3]))
            return Setup("SELL", entry, .7, "H4_STRUCTURE_SHIFT", float(last[3]), "LIMIT") if entry > last[4] else None
        return None


class VolumeProfileGapRider(SignalStrategy):
    def setup(self, ctx, a):
        p = ctx.profile
        if p is None or not p.actual_traded_volume or not p.source:
            raise ValueError("MEASURED_VOLUME_PROFILE_REQUIRED")
        if not p.from_at < p.until_at <= a[-1, 0] or not p.until_at <= p.observed_at <= ctx.asof:
            raise ValueError("PROFILE_LOOKAHEAD")
        b = p.bins
        if b.ndim != 2 or b.shape[1] != 3 or len(b) < 5 or not np.isfinite(b).all() or (b[:, 0] <= 0).any() or (b[:, 1] <= b[:, 0]).any() or (b[:, 2] < 0).any() or (b[1:, 0] != b[:-1, 1]).any():
            raise ValueError("INVALID_PROFILE_BINS")
        median = float(np.median(b[:, 2]))
        if median <= 0:
            raise ValueError("INSUFFICIENT_PROFILE_VOLUME")
        if a[-1, 5] <= 1.5 * a[-21:-1, 5].mean():
            return None
        for i, row in enumerate(b):
            if row[2] > .5 * median or not row[0] <= a[-1, 4] < row[1]:
                continue
            left, right = b[:i][b[:i, 2] >= 1.5 * median], b[i + 1:][b[i + 1:, 2] >= 1.5 * median]
            if len(left) and len(right):
                # The full gap between adjacent HVN clusters must be low volume.
                left_index = int(np.flatnonzero(b[:i, 2] >= 1.5 * median)[-1])
                right_index = i + 1 + int(np.flatnonzero(b[i + 1:, 2] >= 1.5 * median)[0])
                if (b[left_index + 1:right_index, 2] > .5 * median).any():
                    continue
                if a[-2, 4] <= left[-1, 1] < a[-1, 4]:
                    return Setup("BUY", float(a[-1, 4]), .7, "VOLUME_GAP", float(right[0, 0]))
                if a[-2, 4] >= right[0, 0] > a[-1, 4]:
                    return Setup("SELL", float(a[-1, 4]), .7, "VOLUME_GAP", float(left[-1, 1]))
        return None


def cvd_momentum_flat(a: np.ndarray) -> bool:
    if len(a) < 14:
        raise ValueError("CVD_EXIT_WARMUP")
    delta = np.diff(cvd(a))
    prior, recent = float(abs(delta[-13:-3]).mean()), float(abs(delta[-3:]).mean())
    return prior > 0 and recent <= .1 * prior


class VirtualSignalTracker:
    """In-memory research only. Persist/reconcile via canonical authority for real use.

    Stops win same-bar collisions. Crypto trails use prior completed closes and
    initial ATR, never the current candle high before testing that candle's low.
    """
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or Settings()
        self.signals: dict[str, dict] = {}

    def register(self, e: Evaluation) -> str:
        p = e.payload
        if p is None or set(p) != PAYLOAD_KEYS or not math.isfinite(e.atr) or e.atr <= 0 or e.seconds <= 0 or not math.isfinite(e.asof) or e.market not in ("FOREX", "CRYPTO") or e.entry_kind not in ("NEXT_OPEN", "LIMIT"):
            raise ValueError("VALID_EVALUATION_REQUIRED")
        if not all(isinstance(p[k], str) and p[k] for k in ("ticker", "strategy", "regime")) or not math.isfinite(p["signal_intensity"]) or not 0 <= p["signal_intensity"] <= 1:
            raise ValueError("INVALID_SIGNAL_METADATA")
        sign = 1 if p["action"] == "BUY" else -1
        if p["action"] not in ("BUY", "SELL") or not all(math.isfinite(p[k]) and p[k] > 0 for k in ("entry", "sl", "tp")) or sign * (p["entry"] - p["sl"]) <= 0 or sign * (p["tp"] - p["entry"]) <= 0:
            raise ValueError("INVALID_SIGNAL_GEOMETRY")
        key = hashlib.sha256(json.dumps([p, e.asof, e.seconds, e.atr, e.market, e.entry_kind], sort_keys=True).encode()).hexdigest()
        if key not in self.signals:
            self.signals[key] = dict(payload=dict(p), asof=e.asof, seconds=e.seconds, atr=e.atr, market=e.market,
                                     kind=e.entry_kind, status="PENDING", age=0, stop=p["sl"], last=None,
                                     last_bar=None, favorable=p["entry"], fill=None)
        return key

    def update_context(self, key: str, ctx: SignalContext) -> dict | None:
        s = self.signals[key]
        if ctx.ticker != s["payload"]["ticker"] or ctx.market != s["market"]:
            raise ValueError("TRACKING_IDENTITY_MISMATCH")
        a = ctx.h4 if s["seconds"] == 14400 else ctx.bars
        if s["seconds"] != 14400 and ctx.seconds != s["seconds"]:
            raise ValueError("TRACKING_TIMEFRAME_MISMATCH")
        admit(a, s["seconds"], ctx.asof)
        flat = False
        if s["payload"]["strategy"] == "CVDDivergenceEngine":
            try:
                flat = cvd_momentum_flat(a)
            except ValueError:
                pass  # Missing delta never disables protective/time-stop checks.
        return self.update(key, a[-1], ctx.asof, cvd_flat=flat)

    def update(self, key: str, bar: np.ndarray, asof: float, cvd_flat: bool = False) -> dict | None:
        s = self.signals[key]
        admit(np.asarray([bar]), s["seconds"], asof, 1)
        at = float(bar[0])
        if at < s["asof"]:
            return None
        if s["last"] == at:
            if not np.array_equal(bar, s["last_bar"]):
                raise ValueError("CONFLICTING_CANDLE_RETRY")
            return None
        if s["status"] in ("CLOSED", "CANCELLED"):
            return None
        if (s["last"] is None and at != s["asof"]) or (s["last"] is not None and at != s["last"] + s["seconds"]):
            raise ValueError("TRACKING_GAP_REQUIRES_RECONCILIATION")
        s["last"], s["last_bar"] = at, bar.copy()
        p, sign, intrabar = s["payload"], 1 if s["payload"]["action"] == "BUY" else -1, False
        if s["status"] == "PENDING":
            fill = float(bar[1])
            if s["kind"] == "LIMIT":
                touched = bar[3] <= p["entry"] if sign == 1 else bar[2] >= p["entry"]
                if not touched:
                    s["age"] += 1
                    if s["age"] < self.settings.max_bars:
                        return None
                    s["status"] = "CANCELLED"
                    return dict(signal_id=key, status="CANCELLED", reason="LIMIT_EXPIRED", at=asof)
                fill = min(fill, p["entry"]) if sign == 1 else max(fill, p["entry"])
                intrabar = fill == p["entry"] and bar[1] != p["entry"]
            if sign * (fill - s["stop"]) <= 0 or sign * (p["tp"] - fill) <= 0:
                s["status"] = "CANCELLED"
                return dict(signal_id=key, status="CANCELLED", reason="ENTRY_GAP_INVALID", at=asof)
            s.update(fill=fill, status="ACTIVE", age=0, favorable=fill)
        s["age"] += 1
        stop_hit, target_hit = (bar[3] <= s["stop"], bar[2] >= p["tp"]) if sign == 1 else (bar[2] >= s["stop"], bar[3] <= p["tp"])
        reason, price = None, None
        if stop_hit:
            reason, price = "STOP", min(s["stop"], bar[1]) if sign == 1 else max(s["stop"], bar[1])
        elif target_hit and not intrabar:
            reason, price = "TARGET", p["tp"]
        elif cvd_flat and p["strategy"] == "CVDDivergenceEngine":
            reason, price = "CVD_FLAT", bar[4]
        elif s["age"] >= self.settings.max_bars:
            reason, price = "TIME_STOP", bar[4]
        if reason:
            s["status"] = "CLOSED"
            return dict(signal_id=key, status="CLOSED", reason=reason, at=asof, entry_fill=s["fill"],
                        exit=float(price), gross_price_change=float(sign * (price - s["fill"])),
                        bars=s["age"], classification="VIRTUAL_NOT_PROVIDER_FILL")
        if s["market"] == "CRYPTO":
            s["favorable"] = max(s["favorable"], bar[4]) if sign == 1 else min(s["favorable"], bar[4])
            trail = s["favorable"] - sign * self.settings.crypto_trail_atr * s["atr"]
            s["stop"] = max(s["stop"], trail) if sign == 1 else min(s["stop"], trail)
        return None


def profit_factor(realized_net_pnls: list[float]) -> float | None:
    """Caller supplies measured NET outcomes, including costs. No losses => undefined."""
    if not all(math.isfinite(x) for x in realized_net_pnls):
        raise ValueError("NONFINITE_NET_OUTCOME")
    loss = -sum(x for x in realized_net_pnls if x < 0)
    return sum(x for x in realized_net_pnls if x > 0) / loss if loss > 0 else None


def rolling_profit_factor(outcomes: list[tuple[str, float, float]], asof: float,
                          window: int = 100, minimum: int = 30) -> dict:
    """Rows: immutable ID, completed UTC epoch, measured NET result. Not release permission."""
    if not math.isfinite(asof) or not isinstance(window, int) or not isinstance(minimum, int) or not 1 <= minimum <= window <= 5000 or len(outcomes) > 20000:
        raise ValueError("INVALID_ROLLING_WINDOW")
    seen: dict[str, tuple[float, float]] = {}
    previous = -math.inf
    for identity, completed, net in outcomes:
        if not identity or not math.isfinite(completed) or not math.isfinite(net) or completed < previous:
            raise ValueError("INVALID_OR_UNORDERED_NET_EVIDENCE")
        previous = completed
        if completed > asof:
            continue
        if identity in seen and seen[identity] != (completed, net):
            raise ValueError("CONFLICTING_NET_EVIDENCE")
        seen[identity] = (completed, net)
    values = [value[1] for value in list(seen.values())[-window:]]
    pf = profit_factor(values)
    reason = "INSUFFICIENT_SAMPLE" if len(values) < minimum else "UNDEFINED_NO_LOSSES" if pf is None else "BELOW_OR_EQUAL_THRESHOLD" if pf <= 1.0 else "MEASURED_THRESHOLD_ONLY"
    return {"observations": len(values), "profit_factor": pf,
            "above_threshold": len(values) >= minimum and pf is not None and pf > 1.0,
            "reason": reason, "release_approved": False}
