"""Synthetic quotes verify shared cash and position ownership, not a profitable edge."""
import ctypes,importlib.util,pathlib,unittest
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2];spec=importlib.util.spec_from_file_location('income_run',ROOT/'scripts/research/continuous-income/run.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
BASE=1777881600000
class SharedCash(unittest.TestCase):
 def create(self,mask=3):
  tm=np.ascontiguousarray([BASE,BASE+86400000.]);sig=np.ones(2,dtype=np.int8);atr=np.ones(2);st=np.ones(2)*98;cfg=np.ascontiguousarray([100,.01,5.25,.075,.5,5,1.5,5,1440,2,25000,0,3000,1,mask],float);h=r.lib.create(2,r.ptr(tm),sig.ctypes.data_as(r.B),r.ptr(atr),r.ptr(st),2,r.ptr(tm),sig.ctypes.data_as(r.B),r.ptr(atr),r.ptr(st),1,r.ptr(cfg));self.assertTrue(h);self.addCleanup(lambda:r.lib.destroy(h));return h,(tm,sig,atr,st,cfg)
 def feed(self,h,t0,p0,t1=(),p1=()):
  args=[];keep=[]
  for times,prices in [(t0,p0),(t1,p1)]:
   t=np.ascontiguousarray([BASE+x for x in times],float);b=np.ascontiguousarray(prices,float);a=b+.09;keep.extend([t,b,a]);args.extend([len(t),r.ptr(t),r.ptr(b),r.ptr(a)])
  return r.lib.feed2(h,*args)
 def test_merged_streams_share_cash_and_never_open_a_second_asset_while_gold_is_pending_or_open(self):
  h,k=self.create();self.assertEqual(self.feed(h,[0,3000],[100,100],[0,3000],[100,100]),0);a=r.snapshot(h,0,25000);self.assertEqual(a['openSide'],1);self.assertGreater(a['openCosts'],0);self.assertEqual(a['closedTrades'],0)
  self.assertEqual(self.feed(h,[4000],[113],[4000],[113]),0);a=r.snapshot(h,0,25000);self.assertEqual(a['closedTrades'],1);self.assertEqual(a['trades'][0][10],0);self.assertEqual(a['openSide'],0);self.assertAlmostEqual(a['balance'],25000+a['trades'][0][6])
 def test_asset_mask_prevents_gold_from_consuming_jpy_account(self):
  h,k=self.create(mask=2);self.assertEqual(self.feed(h,[0,3000],[100,100]),0);a=r.snapshot(h,0,25000);self.assertEqual(a['openSide'],0);self.assertEqual(a['balance'],25000)
 def test_quote_clock_cannot_go_backwards(self):
  h,k=self.create();self.assertEqual(self.feed(h,[3000],[100]),0);self.assertEqual(self.feed(h,[2000],[100]),-1)
if __name__=='__main__':unittest.main()
