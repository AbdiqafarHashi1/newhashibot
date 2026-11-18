"""Controlled quotes distinguish delayed profit protection from invented fills."""
import importlib.util,pathlib,sys,unittest
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/continuous-income'));import management as m
BASE=1777881600000
class Trailing(unittest.TestCase):
 def test_one_r_trigger_closes_on_a_later_real_quote_while_two_r_profile_remains_open(self):
  t=np.ascontiguousarray([BASE,BASE+86400000.]);sig=np.ones(2,np.int8);atr=np.ones(2);st=np.ones(2)*98;zero=np.zeros(2,np.int8);cfg=np.ascontiguousarray([[100,.01,5.25,.075,.4,5,1.5,5,1440,2,25000,0,3000,3,1,trigger,1] for trigger in [1,2]],float);h=m.lib.create(2,m.ptr(t),sig.ctypes.data_as(m.B),m.ptr(atr),m.ptr(st),2,m.ptr(t),zero.ctypes.data_as(m.B),m.ptr(atr),m.ptr(st),2,m.ptr(cfg));self.assertTrue(h);self.addCleanup(lambda:m.lib.destroy(h));empty=np.zeros(0)
  q=np.ascontiguousarray([BASE,BASE+3000,BASE+4000,BASE+5000,BASE+6000.]);b=np.ascontiguousarray([100,100,103,103,101.]);a=b+.09;self.assertEqual(m.lib.feed2(h,5,m.ptr(q),m.ptr(b),m.ptr(a),0,m.ptr(empty),m.ptr(empty),m.ptr(empty)),0)
  for i in [0,1]:
   o=np.zeros(13);tr=np.zeros((10,12));n=m.lib.snapshot(h,i,m.ptr(o),m.ptr(tr),10)
   if i==0:self.assertEqual(n,1);self.assertEqual(tr[0,1],BASE+6000);self.assertGreater(tr[0,6],0);self.assertLessEqual(tr[0,4],101)
   else:self.assertEqual(n,0);self.assertEqual(o[10],1)
if __name__=='__main__':unittest.main()
