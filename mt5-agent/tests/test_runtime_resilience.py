import unittest
from main import MT5AgentDaemon

class RuntimeResilienceTests(unittest.TestCase):
    def test_snapshot_failure_does_not_terminate_the_data_or_command_stage(self):
        stages=[]
        def failed():
            stages.append('snapshot')
            raise RuntimeError('provider read unavailable')
        self.assertFalse(MT5AgentDaemon._run_stage('snapshot',failed))
        self.assertTrue(MT5AgentDaemon._run_stage('market_data',lambda: stages.append('data') or True))
        self.assertTrue(MT5AgentDaemon._run_stage('commands',lambda: stages.append('commands') or True))
        self.assertEqual(stages,['snapshot','data','commands'])

    def test_data_only_rejects_mutations_even_when_execution_context_is_supplied(self):
        from command_processor import CommandProcessor
        from config import Config
        from unittest.mock import MagicMock,patch
        cloud,terminal=MagicMock(),MagicMock()
        cloud.poll_commands.return_value=[{'id':'command','account_id':'owner-account','operation':'OPEN_POSITION','payload':{},'execution_context':{}}]
        with patch.object(Config,'DATA_ONLY',True),patch.object(Config,'ACCOUNT_ID','owner-account'):
            CommandProcessor(cloud,terminal).process_pending_commands()
        terminal.place_order.assert_not_called()
        self.assertEqual(cloud.ack_command.call_args.args[2],'DATA_ONLY_COMMAND_FORBIDDEN')

    def test_live_quotes_require_explicit_read_only_mode_and_investor_credentials(self):
        from config import Config
        from unittest.mock import MagicMock,patch
        daemon=MT5AgentDaemon.__new__(MT5AgentDaemon)
        daemon.mt5_client=MagicMock();daemon.mt5_client.connect.return_value=True
        daemon.mt5_client.verify_connection.return_value={'ok':True,'account':{'environment':'live'}}
        daemon.credential_capability='investor'
        with patch.object(Config,'DATA_ONLY',True),patch.object(Config,'CUSTOMER_PAIRING_CODE',''):
            self.assertTrue(daemon.connect_mt5())
        with patch.object(Config,'DATA_ONLY',False):
            self.assertFalse(daemon.connect_mt5())
        daemon.credential_capability='master'
        with patch.object(Config,'DATA_ONLY',True):
            self.assertFalse(daemon.connect_mt5())
