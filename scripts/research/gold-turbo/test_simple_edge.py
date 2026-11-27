"""Native screening execution/causality regressions; no profitability assertions."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path=[p for p in sys.path if Path(p).resolve()!=HERE]
import importlib.util
spec=importlib.util.spec_from_file_location('edge',HERE/'simple_edge.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
import unittest
import numpy as np
import pandas as pd
spec2=importlib.util.spec_from_file_location('native_prepare',HERE/'prepare_native_gold.py');prep=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(prep)
BASE=int(pd.Timestamp('2026-10-06T08:00Z').value//1000000)


class NativeScreenTests(unittest.TestCase):
    def arm(self,side=1,capital=25000,risk=.15,leverage=100,commission=3.5,slip=.02,native=False,hold=5,rr=1,standard_limits=False):
        class D:
            t=np.ascontiguousarray([BASE,BASE+60000],dtype=np.float64)
            def features(self,*args):return (np.ascontiguousarray([side,side],dtype=np.int8),np.ascontiguousarray([1.,1.]),np.ascontiguousarray([1999.,1999.] if side==1 else [2001.,2001.]),np.ascontiguousarray([2000.,2000.]))
        m.tick_replay.library=(lambda:m.library('native_gold_ticks.cpp')) if native else m.library
        arm=dict(candidate=0,risk=risk,leverage=leverage,commission=commission,slip=slip,delayMs=200,manageMs=200,sampleMs=200,capital=capital)
        r=m.MarginReplay(D(),[dict(family='fixture',n=0,stop=.5,rr=rr,hold=hold,style=0,session=(1 if standard_limits else 0) if native else 1,mode=0)],[arm]);self.addCleanup(r.close);return r
    def feed(self,r,t,bid,ask):r.ticks(np.ascontiguousarray(t,dtype=np.float64),np.ascontiguousarray(bid,dtype=np.float64),np.ascontiguousarray(ask,dtype=np.float64))
    def raw(self,r):
        v=np.zeros(12);r.lib.micro_summary(r.h,0,m.tick_replay.ptr(v),False);return v
    def test_latency_and_gap_stop_prices_on_both_sides(self):
        for side in (1,-1):
            r=self.arm(side);self.feed(r,[BASE,BASE+199],[2000,2000],[2000.02,2000.02]);self.assertEqual(self.raw(r)[6],0)
            self.feed(r,[BASE+200],[2000],[2000.02]);self.assertEqual(self.raw(r)[6],1)
            b=1998 if side==1 else 2002;self.feed(r,[BASE+400],[b],[b+.02]);row=r.summary()[0]
            self.assertEqual(row['closedTrades'],1);trade=row['trades'][0]
            self.assertAlmostEqual(trade[4],1997.98 if side==1 else 2002.04)
            self.assertAlmostEqual(row['endingBalance'],25000+trade[6])
            q=trade[5];self.assertLessEqual(trade[9]+q*(7+2),25000*.15/100+1e-8)
    def test_quote_gap_cancels_pending_instead_of_stale_fill(self):
        r=self.arm();self.feed(r,[BASE,BASE+4000],[2000,2000],[2000.02,2000.02]);self.assertEqual(self.raw(r)[6],0)
    def test_minimum_lot_is_not_rounded_up_beyond_risk(self):
        r=self.arm(capital=100,risk=.25);self.feed(r,[BASE,BASE+200],[2000,2000],[2000.02,2000.02]);self.assertEqual(self.raw(r)[6],0)
    def test_entry_margin_budget_is_enforced(self):
        r=self.arm(risk=1,leverage=1,commission=0,slip=0);self.feed(r,[BASE,BASE+200],[2000,2000],[2000.02,2000.02])
        row=r.summary()[0];self.assertLessEqual(row['maximumMarginPct'],20.001)
    def test_daily_lock_prevents_followup_after_gap_loss(self):
        r=self.arm(risk=1);self.feed(r,[BASE,BASE+200,BASE+400,BASE+60000,BASE+60200],[2000,2000,1998,2000,2000],[2000.02,2000.02,1998.02,2000.02,2000.02]);self.assertEqual(self.raw(r)[6],1)
    def test_overnight_daily_baseline_uses_floating_equity(self):
        r=self.arm(risk=1,native=True,hold=2880,rr=20)
        midnight=int(pd.Timestamp('2026-10-07T00:00Z').value//1000000)
        self.feed(r,[BASE,BASE+200,midnight-200,midnight,midnight+200,midnight+400],[2000,2000,2005,2005,2003,2003],[2000.02,2000.02,2005.02,2005.02,2003.02,2003.02])
        row=r.summary()[0];self.assertEqual(row['closedTrades'],1)
        self.assertEqual(row['trades'][0][8],3)
        self.assertGreater(row['endingBalance'],25000)
    def test_existing_standard_limit_case_is_explicit_and_separate(self):
        r=self.arm(risk=1,native=True,hold=2880,rr=20,standard_limits=True)
        midnight=int(pd.Timestamp('2026-10-07T00:00Z').value//1000000)
        self.feed(r,[BASE,BASE+200,midnight-200,midnight,midnight+200,midnight+400],[2000,2000,2005,2005,2003,2003],[2000.02,2000.02,2005.02,2005.02,2003.02,2003.02])
        self.assertEqual(self.raw(r)[5],0)
    def test_signal_arrays_are_prefix_invariant(self):
        rng=np.random.default_rng(17);close=2000+np.cumsum(rng.normal(0,.2,300));index=pd.date_range('2026-10-06T00:00Z',periods=300,freq='min')
        f=pd.DataFrame(dict(open=close-.01,high=close+.2,low=close-.2,close=close,volume=100,ask_open=close+.01,ask_high=close+.22,ask_low=close-.18,ask_close=close+.02),index=index)
        full=m.FixedData.__new__(m.FixedData);full.initialize_frame(f)
        partial=m.FixedData.__new__(m.FixedData);partial.initialize_frame(f.iloc[:241])
        for a,b in zip(full.fixed,partial.fixed):np.testing.assert_allclose(a[:241],b,equal_nan=True)
    def test_native_session_edge_candle_is_retained_without_empty_filling(self):
        idx=pd.to_datetime(['2026-10-06T22:02Z','2026-10-06T22:03Z','2026-10-06T22:31Z'])
        f=pd.DataFrame(dict(open=[2000.]*3,high=[2001.]*3,low=[1999.]*3,close=[2000.]*3,volume=[10]*3,ask_open=[2000.1]*3,ask_high=[2001.1]*3,ask_low=[1999.1]*3,ask_close=[2000.1]*3),index=idx)
        rows,quality=prep.aggregate(f,15)
        self.assertEqual(len(rows),2);self.assertEqual(rows[0]['volume'],20)
        self.assertEqual(pd.Timestamp(rows[0]['open_time']).minute,0)
        self.assertEqual(pd.Timestamp(rows[1]['open_time']).minute,30)
        self.assertEqual(quality['buckets_with_fewer_than_m_M1_rows'],2)

if __name__=='__main__':unittest.main()
