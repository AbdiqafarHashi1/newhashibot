import json,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone
from economic_calendar import read_economic_calendar
class CalendarTests(unittest.TestCase):
 def test_source_binding_freshness_and_completeness(self):
  now=datetime(2026,10,18,3,tzinfo=timezone.utc)
  value={'schema_version':'mt5-economic-calendar/v1','observed_at':now.isoformat(),'complete':True,'high_impact_in_window':False,'buffer_minutes':30,'currencies':['USD','EUR','GBP','JPY','AUD','CAD','CHF'],'account_login':'123','server':'demo'}
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory)/'calendar.json';p.write_text(json.dumps(value));self.assertFalse(read_economic_calendar(p,123,'demo',now)['high_impact_in_window']);self.assertIsNone(read_economic_calendar(p,999,'demo',now));value['complete']=False;p.write_text(json.dumps(value));self.assertIsNone(read_economic_calendar(p,123,'demo',now));p.write_text('broken');self.assertIsNone(read_economic_calendar(p,123,'demo',now))
if __name__=='__main__':unittest.main()
