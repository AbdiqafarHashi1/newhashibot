"""Causality, conflict handling and carry/snapshot correctness; no profit fixtures."""
import ctypes,pathlib,sys,unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/execution-frontier'))
from features import Data
from literature import LiteratureData
from continuous import Combined
from literature_native import setup
from study import ptr
import tick_verify as native
class ExtendedTests(unittest.TestCase):
 def test_arbitration_rejects_conflict_and_preserves_exit_style_identity(self):
  r=np.array([1,-1,1,0,0],dtype=np.int8);c=np.array([-1,-1,0,1,-1],dtype=np.int8);values=np.ones(5)
  with patch.object(Data,'features',side_effect=[(r,values,values),(c,values,values)]):
   d=Combined.__new__(Combined);sig,_,_=d.features('ARBITRATED',15,12);np.testing.assert_equal(sig,[0,-1,1,3,-3])
 def test_session_adaptations_never_read_future_days(self):
  idx=pd.date_range('2026-05-01',periods=24*1440,freq='min',tz='UTC');c=100+np.sin(np.arange(len(idx))/300)*2+np.arange(len(idx))*.0001;f=pd.DataFrame(dict(open=c,high=c+.1,low=c-.1,close=c+.02,ask_open=c+.02,ask_high=c+.12,ask_low=c-.08,ask_close=c+.04,volume=10),index=idx);g=f.copy();g.iloc[30000:,g.columns.get_indexer(['open','high','low','close','ask_open','ask_high','ask_low','ask_close'])]+=50
  a=LiteratureData.__new__(LiteratureData);a.symbol='XAUUSD';a.initialize(f);b=LiteratureData.__new__(LiteratureData);b.symbol='XAUUSD';b.initialize(g)
  for family in ['lit_noise','lit_noise_regime','lit_opening_impulse']:
   for x,y in zip(a.features(family,30,14),b.features(family,30,14)):np.testing.assert_equal(x[:30000],y[:30000])
 def test_snapshot_does_not_flatten_and_weekend_carry_is_charged(self):
  setup('continuous-ticks.cpp');lib=native.lib;lib.snapshot.argtypes=lib.summary.argtypes;lib.snapshot.restype=ctypes.c_int;base=pd.Timestamp('2026-05-06T08:00Z').value//1000000;times=np.ascontiguousarray([base,base+60000],dtype=float);sig=np.array([1,0],dtype=np.int8);atr=np.ones(2);st=np.ones(2)*98;cfg=np.ascontiguousarray([100,.01,5.25,.075,.5,10,1.5,5,1440,0,25000,0,3000,0],dtype=float);h=lib.create(2,ptr(times),sig.ctypes.data_as(ctypes.POINTER(ctypes.c_byte)),ptr(atr),ptr(st),1,ptr(cfg));self.assertTrue(h)
  def feed(t,b):
   tt=np.ascontiguousarray(t,dtype=float);bb=np.ascontiguousarray(b,dtype=float);aa=bb+.09;self.assertEqual(lib.feed(h,len(tt),ptr(tt),ptr(bb),ptr(aa)),0)
  def snapshot():
   o=np.zeros(12);tr=np.zeros((100,12));lib.snapshot(h,0,ptr(o),ptr(tr),len(tr));return o
  try:
   feed([base,base+3000],[100,100]);before=snapshot();self.assertEqual(before[10],1);self.assertEqual(before[2],0)
   feed([base+3*86400000],[100]);after=snapshot();self.assertEqual(after[10],1);self.assertAlmostEqual(before[5]-after[5],3*before[11]*100*100*.00015,places=7)
   feed([base+3*86400000+1000],[100]);closed=snapshot();self.assertEqual(closed[10],0);self.assertEqual(closed[2],1)
  finally:lib.destroy(h)
if __name__=='__main__':unittest.main()
