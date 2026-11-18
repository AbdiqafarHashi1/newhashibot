"""Checks for research-only Friday repricing; live strategy/risk policies are untouched."""
import importlib.util,unittest,datetime
from pathlib import Path
spec=importlib.util.spec_from_file_location('friday',Path(__file__).with_name('backfill-friday-closes.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class FridayEvidenceTests(unittest.TestCase):
 def test_calendar_never_uses_next_exit_price(self):
  at=m.ms('2025-04-04T20:00:00Z')
  self.assertEqual(m.first_friday('2025-04-04T19:00:00Z','2025-04-07T00:00:00Z'),at)
  self.assertIsNone(m.first_friday(at,at+3600000))
  self.assertIsNone(m.first_friday(at-3600000,at))
 def test_native_cash_carry_commission_and_adverse_tick(self):
  at=m.ms('2025-04-04T20:00:00Z')
  t=dict(signalId='s',symbol='XAUUSD',openedAt=at-3600000,closedAt=at+3600000,entry=100,side=1,quantity=1,net=20,netR=2)
  a=dict(capital=1000,trades=[t],equityPath=[dict(at=at,balance=998,equity=1008,kind='OBSERVED_QUOTE_MARK',openPositions=1)])
  s=dict(contractSize=1,slippageBps=10,tickSize=.01,commissionPerQuantityPerSide=1)
  r=m.native_close(t,a,dict(management=dict(partialFraction=0)),s,at)
  self.assertAlmostEqual(r['exitPrice'],109.89)
  self.assertAlmostEqual(r['netR'],.689)
  a['equityPath'][0]['at']=at-60001
  self.assertEqual(m.native_close(t,a,dict(management=dict(partialFraction=0)),s,at)['status'],'MISSING_FRESH_NATIVE_MARK')
 def test_short_uses_adverse_ask_rounding(self):
  self.assertAlmostEqual(m.adverse_price(100,-1,1,.01),100.01)
  self.assertAlmostEqual(m.adverse_price(100,1,1,.01),99.99)
 def test_partial_keeps_cost_and_ignores_future_target(self):
  at=m.ms('2025-04-04T20:00:00Z')
  row=dict(candidate=dict(side='buy',stop=90),outcome=dict(entryPrice=100,cashFlowEvents=[dict(time=at-3000,kind='COST',realizedR=-.1),dict(time=at-2000,kind='TP1',realizedR=.75),dict(time=at+1000,kind='EXIT',realizedR=1.25)]))
  q=dict(status='PRICED',at=at,bid=dict(close=110),ask=dict(close=111))
  self.assertAlmostEqual(m.complementary_close(row,q)['netR'],1.15)
  q['status']='NO_FRESH_VENDOR_CANDLE'
  self.assertNotIn('netR',m.complementary_close(row,q))
if __name__=='__main__':unittest.main()
