import importlib.util,pathlib,unittest,numpy as np
spec=importlib.util.spec_from_file_location('trend',pathlib.Path(__file__).parents[2]/'scripts/research/futures-trend-study.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture(sign=1):return np.array([[i*m.STEP,100+sign*i*.1,100+sign*i*.1+.05,100+sign*i*.1-.05,100+sign*i*.1,10]for i in range(400)],float)
class TrendTests(unittest.TestCase):
 def test_independent_long_short_cost_and_clock(self):
  for sign,entry,exit in [(1,120.1,129.9),(-1,79.9,70.1)]:
   t=m.simulate(fixture(sign),200*m.STEP,300*m.STEP)[0]
   self.assertEqual(t['sign'],sign);self.assertAlmostEqual(t['entry'],entry);self.assertAlmostEqual(t['exit'],exit)
   gross=sign*(exit-entry)/entry;cost=(16+3*50)/10000
   self.assertAlmostEqual(t['grossReturn'],gross);self.assertAlmostEqual(t['netReturn'],gross-cost);self.assertAlmostEqual(t['stressReturn'],gross-1.5*cost)
   self.assertEqual(t['entryAt'],201*m.STEP);self.assertEqual(t['exitKnownAt'],300*m.STEP);self.assertEqual(t['bars'],99)
 def test_future_invariance(self):
  a=fixture();b=a.copy();b[300:,1:5]*=7
  self.assertEqual(m.simulate(a,200*m.STEP,300*m.STEP),m.simulate(b,200*m.STEP,300*m.STEP))
 def test_adverse_gap_uses_actual_open(self):
  for sign in [1,-1]:
   a=fixture(sign);a[250,1:5]=[100,101,99,100] if sign==1 else [100,101,99,100]
   t=m.simulate(a,200*m.STEP,300*m.STEP)[0];self.assertEqual(t['exit'],100);self.assertEqual(t['exitBarOpen'],250*m.STEP);self.assertEqual(t['reason'],'STOP_OR_CHANNEL')
 def test_current_close_trail_not_retroactive(self):
  a=fixture();a[250,1:5]=[125,151,124.9,150]
  t=m.simulate(a,200*m.STEP,300*m.STEP)[0];self.assertNotEqual(t['exitBarOpen'],250*m.STEP)
 def test_short_warmup_no_entry(self):
  self.assertEqual(m.simulate(fixture()[:199],0,200*m.STEP),[])
 def test_month_bound(self):
  self.assertEqual(m.months('2022-11-01','2023-02-01'),['2022-11','2022-12','2023-01'])
if __name__=='__main__':unittest.main()
