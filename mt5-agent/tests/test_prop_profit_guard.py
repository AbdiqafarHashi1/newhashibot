import unittest,sys,pathlib,copy
from datetime import datetime,timezone,timedelta
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from prop_profit_guard import profit_cutoff_management_allowed as allowed
class ProfitGuard(unittest.TestCase):
 def fixture(self):
  now=datetime.now(timezone.utc);expected=dict(account_id='a',owner_id='o',bridge_id='b',login=123,server='broker')
  g=dict(authority='PROP_PROFIT_CUTOFF',command_id='cmd',account_id='a',owner_id='o',bridge_id='b',operation='CLOSE_POSITION',ticket='77',cycle_id='cycle',expires_at=(now+timedelta(minutes=1)).isoformat())
  c=dict(id='cmd',operation='CLOSE_POSITION',account_id='a',payload=dict(ticket='77',prop_profit_cycle_id='cycle'),profit_guard_authorization=g)
  a=dict(connected=True,login=123,server='broker',environment='demo',trade_allowed=True,trade_expert=True);t=dict(connected=True,autotrading=True)
  return c,a,t,expected,now
 def test_close_only_management_survives_entry_pause_and_rejects_foreign_or_expired_authority(self):
  c,a,t,e,n=self.fixture();self.assertTrue(allowed(c,a,t,e,n))
  for key,value in [('operation','OPEN_POSITION'),('account_id','other'),('command_id','other'),('ticket','other'),('expires_at',(n-timedelta(seconds=1)).isoformat())]:
   x=copy.deepcopy(c);x['profit_guard_authorization'][key]=value;self.assertFalse(allowed(x,a,t,e,n))
  for key,value in [('login',999),('server','other'),('environment','live'),('trade_allowed',False)]:
   x=dict(a);x[key]=value;self.assertFalse(allowed(c,x,t,e,n))
  self.assertFalse(allowed(c,a,dict(t,autotrading=False),e,n))
 def test_entry_and_non_cutoff_commands_never_get_management_permissions(self):
  c,a,t,e,n=self.fixture();c['operation']='OPEN_POSITION';self.assertFalse(allowed(c,a,t,e,n));c['operation']='CLOSE_POSITION';c.pop('profit_guard_authorization');self.assertFalse(allowed(c,a,t,e,n))
