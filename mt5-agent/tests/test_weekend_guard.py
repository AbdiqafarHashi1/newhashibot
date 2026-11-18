from datetime import datetime,timezone
import unittest
from weekend_guard import weekend_entry_allowed,weekend_management_allowed
class WeekendGuardTests(unittest.TestCase):
    def test_last_mile_rotation_blocks_forex_and_requires_certified_crypto(self):
        before=datetime(2026,11,20,19,59,tzinfo=timezone.utc)
        friday=datetime(2026,11,20,20,0,tzinfo=timezone.utc)
        sunday=datetime(2026,11,22,21,0,tzinfo=timezone.utc)
        self.assertTrue(weekend_entry_allowed('XAUUSD',False,before))
        self.assertFalse(weekend_entry_allowed('XAUUSD',True,friday))
        self.assertFalse(weekend_entry_allowed('BTCUSD',False,friday))
        self.assertTrue(weekend_entry_allowed('BTCUSD',True,friday))
        self.assertTrue(weekend_entry_allowed('EURUSD',True,sunday))
        self.assertFalse(weekend_management_allowed({}, {}, {}, {}, friday))
