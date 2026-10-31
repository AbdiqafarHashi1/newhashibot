"""Existing CloudClient adapter, with transport injected; never contacts a terminal/provider."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path

class CustomerPairingTests(unittest.TestCase):
    def setUp(self):
        self.saved = {key: sys.modules.get(key) for key in ('config', 'logging_config')}
        self.config = types.SimpleNamespace(WORKER_ID='worker-a', ACCOUNT_ID='physical-a', OWNER_ID='customer-a', CUSTOMER_EXECUTION_ACCOUNT_ID='logical-a', CUSTOMER_PAIRING_CODE='1234567890')
        config = types.ModuleType('config'); config.Config = self.config; sys.modules['config'] = config
        logs = types.ModuleType('logging_config'); logs.logger = types.SimpleNamespace(); sys.modules['logging_config'] = logs
        spec = importlib.util.spec_from_file_location('pairing_cloud_client', Path('mt5-agent/cloud_client.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        self.client = module.CloudClient.__new__(module.CloudClient)
        self.client.bridge_id = 'bridge-a'; self.client.base_url = 'https://not-contacted.invalid'
        self.calls = []
        self.client._post = lambda url, payload: (self.calls.append((url, payload)) or (200, {'success': True, 'pairing': {'state': 'CONNECTED'}}))

    def tearDown(self):
        for key, value in self.saved.items():
            if value is None: sys.modules.pop(key, None)
            else: sys.modules[key] = value

    def test_scoped_pairing_consumes_code_only_after_backend_confirmation(self):
        self.client.pair_customer_account({'connected': True, 'environment': 'demo'})
        payload = self.calls[0][1]
        self.assertEqual(payload['execution_account_id'], 'logical-a')
        self.assertEqual(payload['owner_id'], 'customer-a')
        self.assertEqual(payload['account_id'], 'physical-a')
        self.assertEqual(self.config.CUSTOMER_PAIRING_CODE, '')
        self.assertNotIn('password', payload)

    def test_unknown_terminal_does_not_call_transport(self):
        with self.assertRaisesRegex(RuntimeError, 'VERIFIED_TERMINAL'): self.client.pair_customer_account({'connected': True})
        self.assertEqual(len(self.calls), 0)

    def test_live_pairing_is_observation_only_and_keeps_server_environment_check(self):
        self.client.pair_customer_account({'connected': True, 'environment': 'live'})
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn('execution_enabled', self.calls[0][1])

    def test_rejected_pairing_does_not_report_success(self):
        self.client._post = lambda *_: (409, {'success': False, 'error_code': 'PAIRING_INVALID'})
        with self.assertRaisesRegex(RuntimeError, 'PAIRING_INVALID'): self.client.pair_customer_account({'connected': True, 'environment': 'demo'})
        self.assertEqual(self.config.CUSTOMER_PAIRING_CODE, '1234567890')

if __name__ == '__main__': unittest.main()
