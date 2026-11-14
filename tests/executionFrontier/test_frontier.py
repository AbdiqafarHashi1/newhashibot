"""Synthetic correctness fixtures; never used as profitability evidence."""
import pathlib,sys,types,unittest
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/execution-frontier'))
from study import simulate
from features import Data
class EngineTests(unittest.TestCase):
 def data(self,prices,symbol='EURUSD'):
  base=pd.Timestamp('2026-05-05T08:00Z').value//1000000;n=len(prices);x=np.ascontiguousarray([[base+i*60000,*row] for i,row in enumerate(prices)],dtype=float);d=types.SimpleNamespace(symbol=symbol,x=x)
  a=np.ones(n)*.001 if symbol!='USDJPY' else np.ones(n)*.1;sig=np.array([1]+[0]*(n-1),dtype=np.int8);st=np.ones(n)*(prices[0][0]-a[0]*1.5);d.features=lambda *_:(sig,a,st);return d
 def config(self,style=0):return dict(family='fixture',minutes=5,n=12,stop=1.5,rr=3,hold=120,style=style)
 def test_actual_spread_and_costs_are_not_free(self):
  d=self.data([[1.1,1.1001,1.1002,1.1,1.1003,1.1001,1.1,1.1001]]*2);r=simulate(d,self.config(),'2026-05',details=True);self.assertLess(r['returnPct'],0);self.assertGreater(r['commission'],0)
 def test_both_touched_bar_is_stop_first(self):
  d=self.data([[1.1,1.1001,1.12,1.08,1.1201,1.0801,1.1,1.1001]]);r=simulate(d,self.config(),'2026-05',details=True);self.assertEqual(r['trades'][0][8],1);self.assertLess(r['returnPct'],0)
 def test_partial_before_target_reduces_full_target_profit(self):
  d=self.data([[1.1,1.1001,1.107,1.1,1.1071,1.1001,1.106,1.1061]]);full=simulate(d,self.config(),'2026-05',details=True);partial=simulate(d,self.config(3),'2026-05',details=True);self.assertGreater(full['returnPct'],partial['returnPct']);self.assertEqual(partial['trades'][0][10],1)
 def test_next_minute_profit_stop_fills_gap_quote(self):
  d=self.data([[1.1,1.1001,1.102,1.1,1.1021,1.1001,1.1018,1.1019],[1.099,1.0991,1.099,1.099,1.0991,1.0991,1.099,1.0991]]);r=simulate(d,self.config(1),'2026-05',details=True);self.assertEqual(r['trades'][0][8],1);self.assertLess(r['trades'][0][4],1.099);self.assertLess(r['returnPct'],0)
 def test_usdjpy_uses_usd_conversion(self):
  d=self.data([[150,150.01,150.05,150,150.06,150.01,150.04,150.05],[150.2,150.21,150.5,150.2,150.51,150.21,150.48,150.49]],'USDJPY');r=simulate(d,self.config(),'2026-05',details=True);self.assertEqual(r['closedTrades'],1);self.assertGreater(r['returnPct'],0);self.assertLess(r['returnPct'],2)
 def test_later_price_mutation_never_changes_prior_signal_or_stop(self):
  idx=pd.date_range('2026-05-04',periods=10000,freq='min',tz='UTC');c=1.1+np.sin(np.arange(len(idx))/200)*.01;f=pd.DataFrame(dict(open=c,high=c+.0005,low=c-.0005,close=c+.0001,ask_open=c+.0001,ask_high=c+.0006,ask_low=c-.0004,ask_close=c+.0002,volume=10),index=idx);g=f.copy();g.iloc[8000:,g.columns.get_indexer(['open','high','low','close','ask_open','ask_high','ask_low','ask_close'])]+=.5
  a=Data.__new__(Data);a.initialize(f);b=Data.__new__(Data);b.initialize(g)
  for family in ['channel_break','pullback_resume','failed_break','band_reentry','rsi_exhaustion','compression_expand','session_break']:
   for x,y in zip(a.features(family,5,12),b.features(family,5,12)):np.testing.assert_equal(x[:8000],y[:8000])
if __name__=='__main__':unittest.main()
