import ctypes,importlib.util,pathlib,sys,unittest
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/launch'))
import broker_search
class NativeScreenAccounting(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.run_screen=staticmethod(broker_search.engine())
 def run_case(self,inverse=0,missing=False):
  D=ctypes.POINTER(ctypes.c_double);ptr=lambda a:a.ctypes.data_as(D)
  bid=np.array([[100.],[100.],[100.]]);ask=bid+1;high=bid+2;low=bid-2;ahi=high+1;alo=low+1;close=bid.copy();aclose=ask.copy();atr=np.ones_like(bid);signal=np.array([[0],[1],[0]],dtype=np.int8);clock=np.array([1736337600000.,1736337900000.,1736338200000.]);contract=np.array([100000. if inverse else 100.]);ticks=np.array([1.]);inv=np.array([inverse],dtype=np.int32);out=np.zeros(10);trades=np.zeros((10,9))
  if missing:
   for a in [bid,ask,high,low,ahi,alo,close,aclose]:a[1]=np.nan
  rc=self.run_screen(3,1,*[ptr(a) for a in [bid,ask,high,low,ahi,alo,close,aclose,atr]],signal.ctypes.data_as(ctypes.POINTER(ctypes.c_byte)),ptr(clock),ptr(contract),ptr(ticks),inv.ctypes.data_as(ctypes.POINTER(ctypes.c_int)),1,3,.5,5.,2.,3.,86400000.,3.5,0.,10000.,ptr(out),ptr(trades),10)
  self.assertEqual(rc,0);return out,trades
 def test_native_ask_entry_bid_stop_and_per_lot_fees(self):
  out,trades=self.run_case();self.assertEqual(out[4],1);self.assertEqual(trades[0,4],101);self.assertEqual(trades[0,5],99);self.assertAlmostEqual(trades[0,6],-51.75);self.assertAlmostEqual(out[0],9948.25)
 def test_inverse_quote_conversion_uses_exit_price(self):
  out,trades=self.run_case(inverse=1);self.assertAlmostEqual(trades[0,6],-2*.02*100000/99-.02*7);self.assertAlmostEqual(out[0],10000+trades[0,6])
 def test_missing_quotes_cannot_create_a_synthetic_fill(self):
  out,_=self.run_case(missing=True);self.assertEqual(out[5],0);self.assertEqual(out[0],10000)
if __name__=='__main__':unittest.main()
