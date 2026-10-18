import unittest
from types import SimpleNamespace
from unittest.mock import patch
import mt5_client as module
from mt5_client import MT5Client
class NativePayloadTests(unittest.TestCase):
    def test_canonical_stop_alias_attaches_native_protection_and_keeps_exact_quantity(self):
        sent=[]
        native=SimpleNamespace(TRADE_ACTION_DEAL=1,TRADE_ACTION_PENDING=5,ORDER_TYPE_BUY=0,ORDER_TYPE_SELL=1,ORDER_TIME_GTC=0,ORDER_FILLING_IOC=1,ORDER_FILLING_FOK=0,symbol_info_tick=lambda _:SimpleNamespace(ask=1.1,bid=1.0999),order_send=lambda p:(sent.append(p) or SimpleNamespace(retcode=10009,comment='done',order=42,deal=43,price=1.1,volume=.12)),history_deals_get=lambda **kw:[SimpleNamespace(position_id=42)])
        client=MT5Client();client.check_connection=lambda:True;client.get_symbol_info=lambda _:dict(broker_symbol='EURUSD.r',volume_min=.01,volume_max=10,volume_step=.01,digits=5,tick_size=.00001,fill_policies=['ioc'])
        with patch.object(module,'HAS_MT5',True),patch.object(module,'mt5',native):
            r=client.place_order({'symbol':'EURUSD','side':'buy','quantity':.12,'stop_loss':1.090001,'take_profit_2':1.12,'fill_policy':'IOC'})
            self.assertTrue(r['success']);self.assertEqual(sent[0]['volume'],.12);self.assertEqual(sent[0]['symbol'],'EURUSD.r');self.assertGreaterEqual(sent[0]['sl'],1.090001);self.assertEqual(sent[0]['tp'],1.12);self.assertEqual(r['provider_position_id'],'42')
            self.assertFalse(client.place_order({'symbol':'EURUSD','quantity':.125,'sl':1.09,'tp':1.12})['success'])
            self.assertFalse(client.place_order({'symbol':'EURUSD','quantity':.12})['success']);self.assertEqual(len(sent),1)
if __name__=='__main__':unittest.main()
