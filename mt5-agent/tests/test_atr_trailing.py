import copy
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from atr_trailing import POLICY, closed_atr, next_stop, validate_policy
from managed_positions import ManagedPositions
import test_managed_positions as fixed


def market(now):
    boundary = int(now//900)*900
    return {'last_update_at':datetime.fromtimestamp(now,timezone.utc).isoformat(),
            'candles':[dict(timeframe='15m',open_time=datetime.fromtimestamp(boundary+(i-15)*900,timezone.utc).isoformat(),
                            open=100,high=102,low=98,close=100) for i in range(16)]}


class TrailingTests(unittest.TestCase):
    def setUp(self):
        fixed.ManagedTests.setUp(self)
        self.payload.update(symbol='XAUUSD',maximum_holding_seconds=86400,trailing_policy=copy.deepcopy(POLICY),take_profit_1=150,take_profit_2=150)
        self.payload['native_child_orders']=[{**self.payload['native_child_orders'][1], 'symbol':'XAUUSD','quantity':1,'tp':150}]
        self.client.get_market_data=lambda *a,**kw:market(18000)

    # Parent tests exercise different fixed-target payloads; run them in their own class.
    def test_trailing_long_restart_observed_stop_and_failed_modify_retry(self):
        with patch('managed_positions.time.time',return_value=18000):self.manager.execute('trail',self.payload)
        self.client.positions[0]['current_price']=119
        with patch('managed_positions.time.time',return_value=18000):self.manager.monitor()
        self.assertEqual(self.client.modified,[])
        self.client.positions[0]['current_price']=125
        with patch('managed_positions.time.time',return_value=18001):self.manager.monitor()
        self.assertEqual(self.client.modified[-1],('1',121,150))
        self.client.positions[0]['current_price']=123
        manager=ManagedPositions(self.client,self.cloud,self.temp.name)
        with patch('managed_positions.time.time',return_value=18002):manager.monitor()
        self.assertEqual(len(self.client.modified),1)
        self.client.positions[0]['current_price']=130
        with patch('managed_positions.time.time',return_value=18003),patch.object(self.client,'modify_position',return_value={'success':False}):manager.monitor()
        self.assertEqual(self.client.positions[0]['sl'],121)
        with patch('managed_positions.time.time',return_value=18004):manager.monitor()
        self.assertEqual(self.client.modified[-1],('1',126,150))
        self.assertEqual(len(self.client.sent),1)

    def test_trailing_short_uses_ask_and_never_loosens(self):
        self.payload.update(side='SELL',stop_loss=110,take_profit_1=50,take_profit_2=50)
        self.payload['native_child_orders'][0].update(side='sell',sl=110,tp=50)
        with patch('managed_positions.time.time',return_value=18000):self.manager.execute('short',self.payload)
        self.client.positions[0]['current_price']=75
        with patch('managed_positions.time.time',return_value=18001):self.manager.monitor()
        self.assertEqual(self.client.modified[-1],('1',79,50))

    def test_missing_feed_keeps_native_protection_and_does_not_claim_trailing(self):
        with patch('managed_positions.time.time',return_value=18000):self.manager.execute('missing',self.payload)
        self.client.positions[0]['current_price']=125
        self.client.get_market_data=lambda *a,**kw:None
        with patch('managed_positions.time.time',return_value=18001):self.manager.monitor()
        self.assertEqual(self.client.modified,[])
        self.assertEqual(self.client.positions[0]['sl'],90)

    def test_policy_tamper_is_rejected_before_submission(self):
        self.payload['trailing_policy']['triggerR']=1
        with self.assertRaisesRegex(RuntimeError,'FROZEN'):self.manager.execute('bad-policy',self.payload)
        self.assertEqual(self.client.sent,[])


class AtrInputTests(unittest.TestCase):
    def test_closed_bars_only_no_stale_quote_or_gap(self):
        m=market(18000);m['candles'][-1]['high']=100000
        self.assertEqual(closed_atr(m,18000),4)
        self.assertIsNone(closed_atr(m,18061))
        m=market(18000);m['candles'][0]['open_time']=m['candles'][1]['open_time']
        self.assertIsNone(closed_atr(m,18000))
    def test_frozen_contract_and_directional_math(self):
        validate_policy(copy.deepcopy(POLICY))
        self.assertEqual(next_stop(1,100,10,19.99,90,4,1),90)
        self.assertEqual(next_stop(1,100,10,20,90,4,1),116)
        self.assertEqual(next_stop(-1,100,10,20,110,4,1),84)
        self.assertEqual(next_stop(1,100,10,20,120,4,1),120)


if __name__=='__main__':unittest.main()
