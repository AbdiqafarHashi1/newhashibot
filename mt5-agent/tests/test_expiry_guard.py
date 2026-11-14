import copy
import unittest
from datetime import datetime, timezone, timedelta
from expiry_guard import expiry_management_allowed

class ExpiryGuardTests(unittest.TestCase):
    def test_expiry_closes_are_bound_to_owner_terminal_ticket_and_current_server_authority(self):
        expected=dict(account_id='account',owner_id='owner',bridge_id='bridge',login=123,server='demo-server')
        account=dict(connected=True,login=123,server='demo-server',environment='demo',trade_allowed=True,trade_expert=True)
        terminal=dict(connected=True,autotrading=True)
        command=dict(id='command',operation='CLOSE_POSITION',account_id='account',owner_id='owner',bridge_id='bridge',payload=dict(ticket='1234',expiry_entitlement_id='ent'))
        command['expiry_authorization']=dict(authority='EXECUTION_ACCESS_EXPIRED',command_id='command',account_id='account',owner_id='owner',bridge_id='bridge',operation='CLOSE_POSITION',ticket='1234',entitlement_id='ent',expires_at=(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat())
        self.assertTrue(expiry_management_allowed(command,account,terminal,expected))
        for key,value in [('owner_id','other'),('ticket','9999'),('operation','OPEN_POSITION'),('entitlement_id','other'),('expires_at','2020-01-01T00:00:00Z')]:
            bad=copy.deepcopy(command);bad['expiry_authorization'][key]=value;self.assertFalse(expiry_management_allowed(bad,account,terminal,expected))
        for patch in [dict(environment='live'),dict(login=999),dict(trade_allowed=False)]:self.assertFalse(expiry_management_allowed(command,{**account,**patch},terminal,expected))
        self.assertFalse(expiry_management_allowed(command,account,{**terminal,'autotrading':False},expected))

if __name__=='__main__':unittest.main()

class ExpiryProcessorTests(unittest.TestCase):
    def test_expired_entry_gate_still_allows_only_server_bound_demo_close(self):
        from unittest.mock import MagicMock, patch
        from command_processor import CommandProcessor
        from config import Config
        cloud,client=MagicMock(),MagicMock()
        client.assert_demo_execution_identity=MagicMock()
        expected=dict(account_id='account',owner_id='owner',bridge_id='bridge',login=123,server='demo-server')
        command=dict(id='close',operation='CLOSE_POSITION',account_id='account',owner_id='owner',bridge_id='bridge',payload=dict(ticket='1234',expiry_entitlement_id='ent'))
        command['expiry_authorization']=dict(authority='EXECUTION_ACCESS_EXPIRED',command_id='close',account_id='account',owner_id='owner',bridge_id='bridge',operation='CLOSE_POSITION',ticket='1234',entitlement_id='ent',expires_at=(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat())
        client.get_account_info.return_value=dict(connected=True,login=123,server='demo-server',environment='demo',trade_allowed=True,trade_expert=True)
        client.get_terminal_info.return_value=dict(connected=True,autotrading=True)
        client.close_position.return_value=dict(success=True)
        cloud.poll_commands.return_value=[command]
        with patch.multiple(Config,DATA_ONLY=False,ACCOUNT_ID='account',OWNER_ID='owner',BRIDGE_ID='bridge',ACCOUNT_NUMBER=123,SERVER='demo-server'):
            processor=CommandProcessor(cloud,client);self.assertEqual(processor.process_pending_commands(),1)
            client.close_position.assert_called_once_with(ticket='1234',volume=None)
            client.close_position.reset_mock();command['expiry_authorization']['owner_id']='other'
            self.assertEqual(processor.process_pending_commands(),1);client.close_position.assert_not_called()
