import os, sys, tempfile, unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from bridge_manager import AccountInstance, BridgeManager
from policy import ExecutionContext, execution_blockers, resolve_policy

class Phase5DTests(unittest.TestCase):
    def test_policies_are_independent_and_prop_is_account_specific(self):
        self.assertNotEqual(resolve_policy("demo"), resolve_policy("personal"))
        a=resolve_policy("prop",{"starting_balance":100000,"daily_loss_pct":4,"maximum_loss_pct":8})
        b=resolve_policy("prop",{"starting_balance":200000,"daily_loss_pct":3,"maximum_loss_pct":6})
        self.assertNotEqual(a["starting_balance"],b["starting_balance"])
    def test_execution_gate_requires_every_prerequisite(self):
        expiry=(datetime.now(timezone.utc)+timedelta(minutes=1)).isoformat()
        allowed=ExecutionContext(True,True,True,"master",True,True,True,True,True,True,True,False,False,False,True,expiry)
        self.assertEqual(execution_blockers(allowed),[])
        for field in ("bridge_healthy","terminal_authenticated","operational","monitor_healthy","execution_enabled","risk_policy_resolved","capital_allocation_resolved"):
            values=dict(allowed.__dict__); values[field]=False
            self.assertTrue(execution_blockers(ExecutionContext(**values)))
        values=dict(allowed.__dict__); values["credential_capability"]="investor"
        self.assertIn("MT5_INVESTOR_ONLY",execution_blockers(ExecutionContext(**values)))
    @patch("bridge_manager.subprocess.Popen")
    def test_manager_isolates_accounts_and_prevents_duplicates(self,popen):
        process=MagicMock(pid=42); process.poll.return_value=None; popen.return_value=process
        account=AccountInstance("00000000-0000-0000-0000-000000000001","owner-a","Broker","Demo","1234","demo","ref-a","terminal.exe","data-a")
        with tempfile.TemporaryDirectory() as root:
            manager=BridgeManager(root); self.assertEqual(manager.start(account),manager.start(account)); self.assertEqual(popen.call_count,1)
            self.assertEqual(manager.health(account.account_id),"HEALTHY")
            with open(os.path.join(root,account.account_id,"identity.json"),encoding="utf-8") as handle: identity=handle.read()
            self.assertNotIn("password",identity.lower())
if __name__=="__main__": unittest.main()
