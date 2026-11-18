"""Ordered tick fixtures; hypothetical contract assumptions, no performance claim."""
import pathlib,sys,unittest
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/execution-frontier'))
from tick_verify import lib,ptr
BASE=pd.Timestamp('2026-05-05T08:00Z').value//1000000
class TickTests(unittest.TestCase):
 def run_ticks(self,t,b,style=0):
  times=np.ascontiguousarray([BASE,BASE+60000,BASE+120000],dtype=float);sig=np.array([1,0,0],dtype=np.int8);atr=np.ones(3)*.001;st=np.ones(3)*1.0985;cfg=np.ascontiguousarray([100000,.00001,3.5,.00002,.5,10,1.5,3,120,style,25000,0,3000,0],dtype=float);h=lib.create(3,ptr(times),sig.ctypes.data_as(__import__('ctypes').POINTER(__import__('ctypes').c_byte)),ptr(atr),ptr(st),1,ptr(cfg));self.assertTrue(h)
  try:
   time=np.ascontiguousarray([BASE+x for x in t],dtype=float);bid=np.ascontiguousarray(b,dtype=float);ask=bid+.0001;self.assertEqual(lib.feed(h,len(time),ptr(time),ptr(bid),ptr(ask)),0);o=np.zeros(12);tr=np.zeros((100,12));n=lib.summary(h,0,ptr(o),ptr(tr),len(tr));self.assertGreaterEqual(n,0);self.assertAlmostEqual(o[5],25000+sum(tr[:n,6]));return o,tr[:n]
  finally:lib.destroy(h)
 def test_entry_delay_uses_later_actual_quote(self):
  _,tr=self.run_ticks([0,1000,3000,4000],[1.1,1.10001,1.10005,1.106]);self.assertEqual(len(tr),1);self.assertEqual(tr[0,0],BASE+3000);self.assertAlmostEqual(tr[0,3],1.10017);self.assertGreater(tr[0,6],0)
 def test_stop_is_not_widened_for_a_delayed_crossed_entry(self):
  _,tr=self.run_ticks([0,3000,4000],[1.1,1.098,1.106]);self.assertEqual(len(tr),0)
 def test_breakeven_management_cannot_fill_in_the_past(self):
  _,tr=self.run_ticks([0,3000,4000,5000],[1.1,1.1,1.102,1.099],1);self.assertEqual(len(tr),1);self.assertEqual(tr[0,8],8);self.assertLess(tr[0,6],0)
 def test_ordered_native_quotes_resolve_target_before_later_stop(self):
  _,win=self.run_ticks([0,3000,4000,5000],[1.1,1.1,1.106,1.098]);_,loss=self.run_ticks([0,3000,4000,5000],[1.1,1.1,1.098,1.106]);self.assertEqual(win[0,8],2);self.assertEqual(loss[0,8],1)
if __name__=='__main__':unittest.main()
