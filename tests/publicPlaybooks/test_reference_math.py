import sys,unittest,pathlib
import numpy as np
sys.path.insert(0,str(pathlib.Path('scripts/research/public-playbooks').resolve()))
if len(sys.argv)<2:sys.argv.append('UNUSED')
import core as c
from higher import stop_trade
from limits import limit_outcome
class SourceReferenceMath(unittest.TestCase):
 def bars(self):
  return {'t':np.arange(6)*300000,'o':np.array([100.,100,103,104,105,106]),'h':np.array([101.,105,106,107,108,109]),'l':np.array([99.,98,102,103,104,105]),'c':np.array([100.,104,105,106,107,108]),'v':np.ones(6)}
 def test_ema_seed(self):
  result=c.ema(np.array([1.,2,3,4,5]),3);np.testing.assert_allclose(result[2:],[2,3,4])
 def test_wilder_is_not_sma_rsi(self):
  values=np.array([100.,101,102,101,100]);self.assertAlmostEqual(c.rsi(values,2)[-1],25);self.assertAlmostEqual(c.rsi(values,2,False)[-1],0)
 def test_rsi_close_executes_only_at_next_open(self):
  a=self.bars();result=c.simulate(a,np.array([]),np.array([]),0,'buy',90,120,max_bars=5,exit_rsi=np.array([0.,61,0,0,0,0]),period_end=1800000)
  self.assertEqual(result['status'],'RULE_EXIT');self.assertEqual(result['exitPrice'],103);self.assertAlmostEqual(result['netR'],.284)
 def test_missing_future_is_open_not_expired_win(self):
  result=c.simulate(self.bars(),np.array([]),np.array([]),0,'buy',90,120,max_bars=72,period_end=1800000);self.assertEqual(result['status'],'OPEN');self.assertIsNone(result['netR'])
 def test_next_open_beyond_stop_excluded(self):
  a=self.bars();a['o'][1]=85;result=c.simulate(a,np.array([]),np.array([]),0,'buy',90,120,period_end=1800000);self.assertEqual(result['status'],'EXCLUDED')
 def test_stop_first_collision(self):
  a=self.bars();a['h'][1]=125;a['l'][1]=85;result=c.simulate(a,np.array([]),np.array([]),0,'buy',90,120,period_end=1800000);self.assertEqual(result['status'],'STOP');self.assertEqual(result['exitPrice'],90);self.assertAlmostEqual(result['netR'],-1.016)
 def test_funding_boundary_pays_but_never_credits_uncertainty(self):
  a=self.bars();t=np.array([300000]);rate=np.array([.001]);self.assertAlmostEqual(c.funding_cost(a,t,rate,300000,1200000,1,100),.1);self.assertEqual(c.funding_cost(a,t,rate,300000,1200000,-1,100),0)
 def test_funding_interior_has_correct_direction_and_no_future_close(self):
  a=self.bars();t=np.array([600000]);rate=np.array([.001]);long=c.funding_cost(a,t,rate,300000,1200000,1,100);short=c.funding_cost(a,t,rate,300000,1200000,-1,100);self.assertAlmostEqual(long,.103);self.assertAlmostEqual(short,-.103);a['c'][2]=100000;self.assertAlmostEqual(c.funding_cost(a,t,rate,300000,1200000,1,100),long)
 def test_stop_entry_does_not_use_pre_entry_open_as_gap_fill(self):
  a=self.bars();a['o'][0]=90;a['h'][0]=105;a['l'][0]=89;a['c'][0]=100;b={k:v for k,v in a.items()};result=stop_trade(a,np.array([]),np.array([]),0,100,'buy',95,110,1800000,b,1);self.assertEqual(result['status'],'STOP');self.assertEqual(result['exitPrice'],95);self.assertAlmostEqual(result['netR'],-1.032)
 def test_higher_groups_require_complete_native_bars(self):
  a=self.bars();a['t'][2]+=1
  with self.assertRaisesRegex(ValueError,'PARTIAL'):c.aggregate(a,3)
class RestingLimitMath(unittest.TestCase):
 def bars(self):
  return {'t':np.arange(8)*300000,'o':np.full(8,105.),'h':np.full(8,106.),'l':np.full(8,104.),'c':np.full(8,105.),'v':np.ones(8)}
 def event(self):return {'index':0,'side':'buy','role':'crypto.pub-orb'}
 def test_signal_bar_touch_cannot_fill_future_order(self):
  a=self.bars();a['l'][0]=90;result=limit_outcome(a,np.array([]),np.array([]),self.event(),100,90,110,2400000,np.zeros(8));self.assertEqual(result['status'],'UNFILLED')
 def test_exact_touch_is_not_queue_fill(self):
  a=self.bars();a['l'][1]=100;result=limit_outcome(a,np.array([]),np.array([]),self.event(),100,90,110,2400000,np.zeros(8));self.assertEqual(result['status'],'UNFILLED')
 def test_trade_through_and_maker_costs(self):
  a=self.bars();a['l'][1]=99;a['h'][2]=111;result=limit_outcome(a,np.array([]),np.array([]),self.event(),100,90,110,2400000,np.zeros(8));self.assertEqual(result['status'],'TARGET');self.assertEqual(result['entryTime'],c.iso(300000));self.assertAlmostEqual(result['netR'],.9958);self.assertAlmostEqual(result['stressR'],.9832)
 def test_gap_beyond_stop_is_a_loss_not_discarded_trade(self):
  a=self.bars();a['o'][1]=90;a['l'][1]=89;result=limit_outcome(a,np.array([]),np.array([]),self.event(),100,95,110,2400000,np.zeros(8));self.assertEqual(result['status'],'STOP');self.assertEqual(result['exitPrice'],90);self.assertAlmostEqual(result['netR'],-2.0184)
if __name__=='__main__':unittest.main()
