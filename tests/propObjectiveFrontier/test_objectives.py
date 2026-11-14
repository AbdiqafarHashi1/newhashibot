"""Controlled synthetic quotes test account state transitions, not trading profits."""
import ctypes,pathlib,sys,unittest
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/prop-objective-frontier'))
from run import lib,ptr,B
BASE=pd.Timestamp('2026-05-04T08:00Z').value//1000000
DAY=86400000
class Objectives(unittest.TestCase):
 def create(self,phase=2,target=.25,min_days=4):
  times=np.ascontiguousarray([BASE+d*DAY for d in range(20)],dtype=float);signal=np.ones(20,dtype=np.int8);atr=np.ones(20);st=np.ones(20)*98;cfg=np.ascontiguousarray([100,.01,5.25,.075,.25 if phase==2 else .5,5,1.5,5,1440,2,25000,0,3000,BASE,BASE+90*DAY,phase,.25,target,1,min_days,.25],dtype=float);h=lib.create(len(times),ptr(times),signal.ctypes.data_as(B),ptr(atr),ptr(st),1,ptr(cfg));self.assertTrue(h);self.addCleanup(lambda:lib.destroy(h));return h,(times,signal,atr,st,cfg)
 def feed(self,h,offsets,prices):
  t=np.ascontiguousarray([BASE+x for x in offsets],dtype=float);bid=np.ascontiguousarray(prices,dtype=float);ask=bid+.09;self.assertEqual(lib.feed(h,len(t),ptr(t),ptr(bid),ptr(ask)),0)
 def read(self,h):
  o=np.zeros(14);tr=np.zeros((1000,12));n=lib.summary(h,0,ptr(o),ptr(tr),len(tr));self.assertGreaterEqual(n,0);ev=np.zeros((1000,7));ne=lib.events(h,0,ptr(ev),len(ev));self.assertGreaterEqual(ne,0);return o,tr[:n],ev[:ne]
 def test_funded_cutoff_waits_for_net_flat_and_payout_clock(self):
  h,keep=self.create();self.feed(h,[0,3000,4000,5000],[100,100,103,103]);o,tr,ev=self.read(h);self.assertEqual(o[0],3);self.assertEqual(len(tr),1);self.assertGreaterEqual(o[5],25000*1.0025);self.assertEqual(o[3],BASE+3000+14*DAY);self.assertFalse(any(e[1]==4 for e in ev))
  balance=o[5];self.feed(h,[DAY,DAY+3000,14*DAY+3000],[100,100,100]);o,tr,ev=self.read(h);self.assertEqual(o[5],balance);self.assertEqual(len(tr),1);self.assertTrue(any(e[1]==4 for e in ev))
 def test_minimum_days_cannot_be_replaced_with_single_profitable_trade(self):
  h,keep=self.create(phase=0);self.feed(h,[0,3000,4000,5000],[100,100,103,103]);o,tr,ev=self.read(h);self.assertEqual(o[0],0);self.assertEqual(o[10],1);self.assertFalse(any(e[1]==2 for e in ev))
 def test_phase_reset_occurs_only_after_genuine_entry_days(self):
  h,keep=self.create(phase=0,min_days=2);self.feed(h,[0,3000,4000,5000],[100,100,103,103]);self.feed(h,[DAY,DAY+3000,DAY+4000,DAY+5000],[100,100,103,103]);o,tr,ev=self.read(h);self.assertEqual(o[0],1);self.assertEqual(o[5],25000);self.assertTrue(any(e[1]==2 for e in ev));self.assertEqual(o[1],0)
 def test_no_trade_or_pass_before_the_cohort_start(self):
  h,keep=self.create(phase=0);self.feed(h,[-DAY,-DAY+3000],[100,200]);o,tr,ev=self.read(h);self.assertEqual(len(tr),0);self.assertEqual(len(ev),0);self.assertEqual(o[1],0)
if __name__=='__main__':unittest.main()
