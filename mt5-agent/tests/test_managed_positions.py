import copy
import json
import tempfile
import unittest
from unittest.mock import patch
from config import Config
from managed_positions import ManagedPositions

class Client:
    def __init__(self):
        self.positions=[];self.sent=[];self.modified=[];self.deals={};self.reject_second=False;self.hedging=True
    def get_account_info(self):return {'login':123,'server':'demo-server','environment':'demo','hedging':self.hedging}
    def get_symbol_info(self,symbol):return {'broker_symbol':symbol,'volume_min':.1,'volume_max':100,'volume_step':.1,'tick_size':1,'digits':2}
    def normalize_volume(self,v,*args):return round(v,1)
    def get_positions(self):return copy.deepcopy(self.positions)
    def get_history(self):return []
    def place_order(self,p):
        self.sent.append(p)
        if self.reject_second and len(self.sent)==2:return {'success':False}
        self.positions.append({'ticket':str(len(self.sent)),'comment':p['comment'],'symbol':p['symbol'],'side':p['side'],'quantity':p['volume'],'entry_price':100,'sl':p['sl'],'tp':p['tp']})
        return {'success':True,'executed_volume':p['volume']}
    def modify_position(self,ticket,sl,tp):
        self.modified.append((ticket,sl,tp))
        for p in self.positions:
            if p['ticket']==ticket:p.update(sl=sl,tp=tp)
        return {'success':True}
    def close_position(self,ticket,volume=None):return {'success':True}
    def position_deals(self,ticket):return self.deals.get(ticket,[])
class Cloud:
    def __init__(self):self.events=[];self.accept=True
    def ack_command(self,c,*args,result_data=None):self.events.append(result_data['lifecycle_event']);return self.accept
class ManagedTests(unittest.TestCase):
    def setUp(self):
        self.scope=patch.multiple(Config,DATA_ONLY=False,OWNER_ID='owner',ACCOUNT_ID='account',BRIDGE_ID='bridge',ACCOUNT_NUMBER=123,SERVER='demo-server');self.scope.start();self.addCleanup(self.scope.stop)
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.client=Client();self.cloud=Cloud();self.manager=ManagedPositions(self.client,self.cloud,self.temp.name)
        self.payload={'certified':True,'phase_d_intent_id':'intent','quantity':1,'symbol':'EURUSD','side':'BUY','stop_loss':90,'take_profit_1':110,'take_profit_2':120,'native_child_orders':[{'role':'ENTRY_TP1','symbol':'EURUSD','side':'buy','quantity':.5,'sl':90,'tp':110,'client_order_id':'leg1','fill_policy':'IOC'},{'role':'ENTRY_TP2','symbol':'EURUSD','side':'buy','quantity':.5,'sl':90,'tp':120,'client_order_id':'leg2','fill_policy':'IOC'}]}
    def test_exact_quantity_attached_protection_and_restart_no_resubmission(self):
        r=self.manager.execute('cmd',self.payload);self.assertEqual(r['lifecycle_event'],'PROTECTION_CONFIRMED');self.assertEqual(sum(p['volume'] for p in self.client.sent),1);self.assertTrue(all(p['sl']==90 for p in self.client.sent));self.assertEqual([p['tp'] for p in self.client.sent],[110,120]);ManagedPositions(self.client,self.cloud,self.temp.name).execute('cmd',self.payload);self.assertEqual(len(self.client.sent),2)
    def test_uncertain_second_child_never_repeats_or_exceeds_budget(self):
        self.client.reject_second=True;r=self.manager.execute('cmd',self.payload);self.assertEqual(r['lifecycle_event'],'PARTIAL_FILL');self.manager.execute('cmd',self.payload);self.assertEqual(len(self.client.sent),2);self.assertEqual(self.client.positions[0]['sl'],90)
    def test_only_exact_tp1_native_deal_moves_runner_to_be_without_loosen(self):
        self.manager.execute('cmd',self.payload);self.client.positions[0]['current_price']=115;self.manager.monitor();self.assertEqual(self.client.modified,[])
        self.client.positions=self.client.positions[1:];self.client.deals['1']=[{'position_id':'1','volume':.5,'is_exit':True,'is_tp_exit':False}];self.manager.monitor();self.assertEqual(self.client.modified,[])
        self.client.deals['1'][0]['is_tp_exit']=True;self.manager.monitor();self.assertEqual(self.client.modified,[('2',100,120)]);self.assertEqual(self.cloud.events[-1],'BREAKEVEN_CONFIRMED');self.client.positions[0]['sl']=105;self.manager.monitor();self.assertEqual(len(self.client.modified),1)
    def test_sl_close_is_not_tp2_and_failed_publication_retries(self):
        self.manager.execute('cmd',self.payload);self.client.positions=[]
        for i in ['1','2']:self.client.deals[i]=[{'position_id':i,'volume':.5,'is_exit':True,'is_tp_exit':False}]
        self.cloud.accept=False;self.manager.monitor();self.assertEqual(self.cloud.events[-1],'POSITION_CLOSED');self.cloud.accept=True;self.manager.monitor();self.assertEqual(self.cloud.events.count('POSITION_CLOSED'),2)
    def test_scope_netting_and_quantity_inflation_reject_before_sending(self):
        self.client.hedging=False
        with self.assertRaises(RuntimeError):self.manager.execute('cmd',self.payload)
        self.client.hedging=True;self.payload['native_child_orders'][0]['quantity']=1
        with self.assertRaises(RuntimeError):self.manager.execute('cmd',self.payload)
        self.assertEqual(self.client.sent,[])
    def test_pending_order_cannot_silently_turn_into_market_execution(self):
        self.payload['native_child_orders'][0]['action']='pending'
        with self.assertRaisesRegex(RuntimeError,'MARKET_ENTRY'):self.manager.execute('cmd',self.payload)
        self.assertEqual(self.client.sent,[])
    def test_native_duplicate_without_journal_does_not_resubmit(self):
        self.manager.execute('cmd',self.payload)
        for path in self.manager.directory.glob('*.json'):path.unlink()
        with self.assertRaisesRegex(RuntimeError,'JOURNAL_RECONCILIATION'):self.manager.execute('cmd',self.payload)
        self.assertEqual(len(self.client.sent),2)
if __name__=='__main__':unittest.main()
