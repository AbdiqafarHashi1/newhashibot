import pathlib,sys,unittest
import numpy as np
import pandas as pd
ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts/research/launch'))
import search
class CausalEntries(unittest.TestCase):
 def data(self):
  index=pd.date_range('2025-01-06',periods=600,freq='5min',tz='UTC');p=100+np.sin(np.arange(600)/8)*.5
  frame=pd.DataFrame({'o':p,'h':p+.1,'l':p-.1,'c':p,'v':100.,'qv':p*100},index=index)
  frame.iloc[200]=[100,103,99.7,99.8,100,9980];frame.iloc[201]=[100,100.2,99.3,99.5,100,9950]
  return frame
 def wrap(self,frame):
  d=search.Data.__new__(search.Data);d.frames=[frame];d.clock=frame.index;d.cache={};d.atr={};return d
 def test_sweep_needs_the_next_closed_retest_candle(self):
  d=self.wrap(self.data());signals,_=d.feature('sweep_retest',5,12)
  self.assertEqual(signals[201,0],0,'a still-open confirmation candle cannot be used');self.assertEqual(signals[202,0],-1,'confirmation is actionable at its close / next bar open')
 def test_future_prices_never_change_an_earlier_entry(self):
  original=self.data();altered=original.copy();altered.iloc[350:,0:4]*=2
  for family in ['sweep_retest','band_reentry','london_range_break']:
   a,_=self.wrap(original).feature(family,15,12);b,_=self.wrap(altered).feature(family,15,12);np.testing.assert_array_equal(a[:350],b[:350],err_msg=family)
if __name__=='__main__':unittest.main()
