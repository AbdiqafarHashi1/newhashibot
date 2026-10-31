import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('audit',pathlib.Path('scripts/research/funding-audit/audit.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class FundingMath(unittest.TestCase):
 def test_long_debit_short_credit_and_stress(self):
  long=a.settlements([3600000],[.001],[0,3600000],[90,100],0,7200000,7200000,1)[0];short=a.settlements([3600000],[.001],[0,3600000],[90,100],0,7200000,7200000,-1)[0]
  self.assertAlmostEqual(long['quoteCost'],.1);self.assertAlmostEqual(short['quoteCost'],-.1);self.assertAlmostEqual(long['stressQuoteCost'],.15);self.assertAlmostEqual(short['stressQuoteCost'],-.1)
 def test_entry_boundary_never_receives_uncertain_credit(self):
  self.assertEqual(a.settlements([1000],[.001],[0],[100],0,100000,100000,-1),[]);self.assertEqual(len(a.settlements([1000],[.001],[0],[100],0,100000,100000,1)),1)
 def test_uncertain_exit_credit_denied_adverse_payment_included(self):
  self.assertEqual(a.settlements([60000],[.001],[0],[100],0,50000,90000,-1),[]);self.assertEqual(len(a.settlements([60000],[.001],[0],[100],0,50000,90000,1)),1)
 def test_missing_price_proxy_blocks(self):
  with self.assertRaisesRegex(ValueError,'PROXY'):a.settlements([3600000],[.001],[0],[100],0,7200000,7200000,1)
 def test_independent_short_cashflow(self):
  e=a.settlements([3600000],[.001],[0,3600000],[100,100],0,7200000,7200000,-1)[0];net=(100-80-100*.0016-e['quoteCost'])/10;stress=(100-80-100*.0024-e['stressQuoteCost'])/10
  self.assertAlmostEqual(net,1.994);self.assertAlmostEqual(stress,1.986)
if __name__=='__main__':unittest.main()
