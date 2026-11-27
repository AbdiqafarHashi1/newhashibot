from dataclasses import replace
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
import unittest
from types import SimpleNamespace
from gold_turbo.arbitration import regime_fit
from gold_turbo.contracts import Candle,Tick
from gold_turbo.simple_intraday import simple_intraday_signal,simple_atr
from gold_turbo.momentum import MomentumConfig,MomentumScalper
from test_gold_turbo_scalpers import snapshot,COSTS

def bar(at,o=2000.,h=2000.2,l=1999.8,c=2000.):
    return Candle('XAUUSD','test',60000,int(at.timestamp()*1000),o,h,l,c,10,'BROKER_COMPLETED_BAR')

class SimpleIntradayTests(unittest.TestCase):
    def test_session_breakout_competes_as_continuation_in_matching_context(self):
        s=snapshot();m5=replace(s.frames[1],regime='TREND_UP');s=replace(s,frames=(s.frames[0],m5,s.frames[2]))
        self.assertEqual(regime_fit(s,SimpleNamespace(decision='LONG',entry_model='SESSION_BREAKOUT'),s.as_of_ms),1)
        self.assertEqual(regime_fit(s,SimpleNamespace(decision='SHORT',entry_model='SESSION_BREAKOUT'),s.as_of_ms),0)
    def pullback(self):
        at=datetime(2026,10,20,12,tzinfo=ZoneInfo('UTC'))
        rows=[bar(at+timedelta(minutes=i)) for i in range(12)]
        rows.extend([bar(at+timedelta(minutes=12),1999.,2000.3,1998.9,2000.2),bar(at+timedelta(minutes=13),2000.2,2000.25,1999.8,2000.),bar(at+timedelta(minutes=14),2000.,2000.6,1999.9,2000.4)])
        return rows
    def test_long_and_short_pullbacks_preserve_geometry_and_scalp_horizon(self):
        for side in (1,-1):
            rows=self.pullback()
            if side==-1:rows=[replace(r,open=4000-r.open,high=4000-r.low,low=4000-r.high,close=4000-r.close) for r in rows]
            s=simple_intraday_signal(rows,1.,'SIMPLE_PULLBACK',rows[-1].end_ms)
            self.assertEqual(s.side,side);self.assertEqual(s.maximum_hold_ms,600000)
            self.assertAlmostEqual(side*(s.target-s.reference)/abs(s.reference-s.stop),1.5)
    def test_future_stale_and_discontinuous_bars_never_admit(self):
        rows=self.pullback();at=rows[-1].end_ms
        self.assertIsNone(simple_intraday_signal(rows,1.,'SIMPLE_PULLBACK',at-1))
        self.assertIsNone(simple_intraday_signal(rows,1.,'SIMPLE_PULLBACK',at+5001))
        self.assertIsNone(simple_intraday_signal(rows[:5]+rows[6:],1.,'SIMPLE_PULLBACK',at))
    def test_opening_session_uses_new_york_clock_across_dst(self):
        for date in ((2026,10,20),(2026,11,3)):
            at=datetime(*date,9,30,tzinfo=ZoneInfo('America/New_York'))
            rows=[bar(at+timedelta(minutes=i),2000.,2001.,1999.,2000.) for i in range(15)]
            rows.extend([bar(at+timedelta(minutes=15),2000.,2000.7,1999.5,2000.5),bar(at+timedelta(minutes=16),2000.5,2001.3,2000.4,2001.2)])
            s=simple_intraday_signal(rows,1.,'SESSION_BREAKOUT',rows[-1].end_ms)
            self.assertIsNotNone(s);self.assertEqual(s.anchor,rows[0].open_ms);self.assertEqual(s.maximum_hold_ms,900000)
            self.assertIsNone(simple_intraday_signal(rows[1:],1.,'SESSION_BREAKOUT',rows[-1].end_ms))
    def test_old_prefix_does_not_change_fixed_atr(self):
        rows=self.pullback();older=[bar(datetime(2026,10,20,11,59,tzinfo=ZoneInfo('UTC')),1500.,2500.,1000.,1500.)]
        self.assertEqual(simple_atr(rows),simple_atr(older+rows))
    def test_baseline_remains_default_and_unknown_variant_fails_closed(self):
        self.assertEqual(MomentumConfig().entry_variant,'BASELINE_RETEST')
        with self.assertRaises(ValueError):MomentumConfig(entry_variant='UNVERIFIED')
        with self.assertRaises(ValueError):MomentumConfig(entry_variant='SESSION_BREAKOUT',primary_timeframe_ms=300000)
    def test_simple_model_flows_through_production_plan_cost_and_duplicate_guards(self):
        original=snapshot();rows=[replace(r,source=original.source) for r in self.pullback()];now=rows[-1].end_ms+100
        m1=replace(original.frames[0],completed=tuple(rows),contiguous_usable_bars=len(rows))
        end=rows[-1].end_ms
        m15rows=tuple(Candle('XAUUSD',original.source,900000,end-(3-i)*900000,2000.,2001.,1999.,2000.,10,'BROKER_COMPLETED_BAR') for i in range(3))
        m15=replace(original.frames[2],completed=m15rows,contiguous_usable_bars=3)
        snap=replace(original,as_of_ms=now,latest_tick=Tick('XAUUSD',original.source,now,2000.41,2000.43),windows=(),frames=(m1,original.frames[1],m15),quality=(),spread_spike=False,volatility_shock=False)
        engine=MomentumScalper(MomentumConfig(entry_variant='SIMPLE_PULLBACK'))
        decision=engine.evaluate(snap,COSTS,now)
        self.assertIsNotNone(decision.plan,decision.reasons)
        self.assertEqual(decision.entry_model,'SIMPLE_PULLBACK')
        self.assertEqual(decision.plan.maximum_hold_ms,600000)
        self.assertIsNone(decision.plan.early_failure_velocity_atr_per_second)
        engine.record_admission(decision,now)
        self.assertIsNone(engine.evaluate(snap,COSTS,now+1).plan)

if __name__=='__main__':unittest.main()
