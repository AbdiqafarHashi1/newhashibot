"""Controlled simulator checks only. Synthetic fixtures are not performance evidence."""
import pathlib,sys,types,unittest
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/gold-micro'))
from tick_replay import Replay
from features import Data
BASE=pd.Timestamp('2026-08-03T07:00:00Z').value//1000000
class MicroTests(unittest.TestCase):
 def replay(self,t,b,*,style=0,mode=0,delay=1000,sample=0,signal=None,level=None,ref=None,atr=None,chunks=False):
  d=types.SimpleNamespace(t=np.ascontiguousarray([BASE,BASE+60000,BASE+120000],dtype=float));arr=lambda x:np.ascontiguousarray(x,dtype=float)
  d.features=lambda *_:(np.ascontiguousarray(signal or [1,0,0],dtype=np.int8),arr(atr or [2,2,2]),arr(level or [1998,1998,1998]),arr(ref or [2000,2000,2000]))
  cfg=dict(family='controlled',n=5,stop=1,rr=2,hold=1,style=style,session=1,mode=mode);arm=dict(candidate=0,risk=.5,leverage=10,commission=3.5,slip=.02,delayMs=delay,manageMs=1000,capital=25000,sampleMs=sample);r=Replay(d,[cfg],[arm]);tt=arr([BASE+x for x in t]);bb=arr(b);aa=bb+.1
  try:
   if chunks:
    for j in range(len(tt)):r.ticks(tt[j:j+1],bb[j:j+1],aa[j:j+1])
   else:r.ticks(tt,bb,aa)
   return r.summary()[0]
  finally:r.close()
 def test_latency_uses_later_real_quote_and_timeout_waits_for_management(self):
  r=self.replay([0,500,1000,2000,61000,62000],[2000,2001,2000.2,2004,2004,2004]);self.assertEqual(r['closedTrades'],1);t=r['trades'][0];self.assertEqual(t[0],BASE+1000);self.assertAlmostEqual(t[3],2000.32);self.assertEqual(t[1],BASE+62000);self.assertGreater(r['costs'],0)
 def test_native_tick_order_disambiguates_stop_and_target(self):
  win=self.replay([0,1000,2000,3000],[2000,2000,2005,1990]);loss=self.replay([0,1000,2000,3000],[2000,2000,1990,2005]);self.assertGreater(win['trades'][0][6],0);self.assertLess(loss['trades'][0][6],0);self.assertEqual(win['trades'][0][8],2);self.assertEqual(loss['trades'][0][8],1)
 def test_chunking_does_not_change_fills_or_account(self):
  t=[0,1000,2000,3000,61000,62000];b=[2000,2000,2001.8,2001.9,2002,2001.5];self.assertEqual(self.replay(t,b,style=2),self.replay(t,b,style=2,chunks=True))
 def test_delayed_profit_protection_cannot_fill_at_a_past_better_price(self):
  r=self.replay([0,1000,1500,2000,2500],[2000,2000,2001.8,1999,1999.5],style=2);self.assertEqual(r['closedTrades'],1);self.assertEqual(r['trades'][0][1],BASE+2500);self.assertEqual(r['trades'][0][8],8);self.assertLess(r['trades'][0][6],0);self.assertAlmostEqual(r['trades'][0][4],1999.48)
 def test_pending_trigger_keeps_original_stop_across_minute_change(self):
  r=self.replay([0,58000,58250,60000,61250,70000],[2000,2000.6,2000.61,2000.63,2000.65,2000.7],mode=1,delay=3000,signal=[1,1,0],atr=[2,100,100],level=[1998,1000,1000],ref=[2000.5,2500,2500]);self.assertEqual(r['closedTrades'],1);t=r['trades'][0];self.assertEqual(t[0],BASE+61250);self.assertAlmostEqual(t[9]/(t[5]*100),2.77)
 def test_reversal_observes_sweep_on_first_quote_of_minute(self):
  r=self.replay([0,250,500,750,1750,2000],[1998,1998.8,1999.2,1999.3,1999.35,2000],mode=2,signal=[2,0,0],level=[1999,1999,1999],ref=[2005,2005,2005]);self.assertEqual(r['closedTrades'],1);self.assertEqual(r['trades'][0][0],BASE+1750)
 def test_stop_and_target_are_frozen_before_entry_delay(self):
  r=self.replay([0,1000,2000],[2000,1997,2005],level=[1999.5,1999.5,1999.5]);self.assertEqual(r['closedTrades'],0)
 def test_better_later_quote_does_not_move_the_original_price_target(self):
  r=self.replay([0,1000,2000],[2000,2000.2,2004.4]);self.assertEqual(r['closedTrades'],1);self.assertAlmostEqual(r['trades'][0][4],2004.34)
 def test_broker_stop_remains_active_between_slow_client_samples(self):
  r=self.replay([0,1000,1100,1200,3000],[2000,2000,1990,2005,2005],sample=5000);self.assertEqual(r['closedTrades'],1);self.assertEqual(r['trades'][0][1],BASE+1100);self.assertLess(r['trades'][0][6],0)
 def test_closed_features_never_read_future_minutes(self):
  times=pd.date_range('2026-08-03T07:00:00Z',periods=360,freq='min');c=2000+np.sin(np.arange(360)/4)*2+np.arange(360)*.01;f=pd.DataFrame(dict(open=c,high=c+.5,low=c-.5,close=c+.1,volume=10,ask_open=c+.05,ask_high=c+.55,ask_low=c-.45,ask_close=c+.15),index=times);g=f.copy();g.loc[g.index[330:],['open','high','low','close','ask_open','ask_high','ask_low','ask_close']]+=100
  a=Data.__new__(Data);a.initialize_frame(f);b=Data.__new__(Data);b.initialize_frame(g)
  for family in ['sweep_reclaim','trend_pullback','impulse_retest','stretch_snapback','level_reclaim','momentum_burst','watch_reversal','watch_trend','watch_breakout','watch_support_reversal','watch_two_bar_resume','watch_strong_resume','watch_adaptive_resume','watch_aligned_resume']:
   for x,y in zip(a.features(family,10),b.features(family,10)):np.testing.assert_equal(x[:330],y[:330])
if __name__=='__main__':unittest.main()
