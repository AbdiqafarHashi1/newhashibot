"""Test payout cash flows and clocks with synthetic quotes, not profit evidence."""
import pathlib,sys,unittest
import numpy as np
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import test_objectives as base
from recurring import lib
from run import ptr,B
DAY=base.DAY;BASE=base.BASE
class Recurring(base.Objectives):
 def setUp(self):
  self.old=base.lib;base.lib=lib;self.addCleanup(lambda:setattr(base,'lib',self.old))
 def create(self,phase=2,target=.25,min_days=4):
  times=np.ascontiguousarray([BASE+d*DAY for d in range(40)],dtype=float);signal=np.ones(40,dtype=np.int8);atr=np.ones(40);st=np.ones(40)*98;cfg=np.ascontiguousarray([100,.01,5.25,.075,.25 if phase==2 else .5,5,1.5,5,1440,2,25000,0,3000,BASE,BASE+90*DAY,phase,.25,target,1,min_days,.25,1],dtype=float);h=lib.create(len(times),ptr(times),signal.ctypes.data_as(B),ptr(atr),ptr(st),1,ptr(cfg));self.assertTrue(h);self.addCleanup(lambda:lib.destroy(h));return h,(times,signal,atr,st,cfg)
 def read(self,h):
  o=np.zeros(18);tr=np.zeros((1000,12));n=lib.summary(h,0,ptr(o),ptr(tr),len(tr));ev=np.zeros((1000,7));ne=lib.events(h,0,ptr(ev),len(ev));self.assertGreaterEqual(n,0);self.assertGreaterEqual(ne,0);return o,tr[:n],ev[:ne]
 def test_funded_cutoff_waits_for_net_flat_and_payout_clock(self):
  h,keep=self.create();self.feed(h,[0,3000,4000,5000],[100,100,103,103]);o,tr,ev=self.read(h);self.assertEqual(o[0],3);self.assertFalse(any(e[1]==4 for e in ev));self.assertEqual(len(tr),1)
  self.feed(h,[14*DAY+3000],[100]);o,tr,ev=self.read(h);self.assertEqual(o[5],25000);self.assertEqual(o[14],1);self.assertEqual(len(tr),1)
 def test_withdrawal_reconciles_and_approval_wait_blocks_reentry(self):
  h,keep=self.create();self.feed(h,[0,3000,4000,5000],[100,100,103,103]);o,tr,ev=self.read(h);banked=o[5];self.assertGreater(banked,25000)
  self.feed(h,[14*DAY+3000,14*DAY+4000],[100,100]);o,tr,ev=self.read(h);self.assertEqual(o[14],1);self.assertAlmostEqual(o[15],banked-25000);self.assertAlmostEqual(o[16],(banked-25000)*.8);self.assertEqual(o[5],25000);self.assertEqual(len(tr),1)
  self.feed(h,[15*DAY,15*DAY+3000],[100,100]);o,tr,ev=self.read(h);self.assertEqual(len(tr),1);self.assertEqual(o[17],0)
  self.feed(h,[31*DAY,31*DAY+3000],[100,100]);o,tr,ev=self.read(h);self.assertGreater(o[17],0);self.assertAlmostEqual(25000+tr[:,6].sum()-o[15]-o[17],o[5]);self.assertEqual(sum(e[1]==4 for e in ev),1)
if __name__=='__main__':unittest.main()
