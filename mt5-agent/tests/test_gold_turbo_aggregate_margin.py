"""Account margin budget includes existing and uncertain reserved exposure."""
from types import SimpleNamespace
import unittest
from gold_turbo.runtime import GoldTurboRuntime
from gold_turbo.micro import MicroScalper
from test_gold_turbo_runtime import Terminal
from test_gold_turbo_scalpers import snapshot,COSTS

class AggregateMarginTests(unittest.TestCase):
    def test_existing_margin_uses_account_headroom_not_a_new_full_budget(self):
        s=snapshot();client=Terminal(s);r=GoldTurboRuntime.__new__(GoldTurboRuntime);r.client=client;r.books={}
        p=MicroScalper().evaluate(s,COSTS,s.as_of_ms).plan;spec=client.get_symbol_info('XAUUSD');a=client.get_account_info()
        lease=dict(slippage_quote_per_side=.005,max_margin_pct=20)
        self.assertIsNotNone(r._size(p,spec,a,lease,2))
        self.assertIsNone(r._size(p,spec,dict(a,margin=200,free_margin=800),lease,2))
    def test_valid_volume_is_reduced_to_margin_capacity(self):
        s=snapshot();client=Terminal(s);r=GoldTurboRuntime.__new__(GoldTurboRuntime);r.client=client;r.books={}
        p=MicroScalper().evaluate(s,COSTS,s.as_of_ms).plan
        sized=r._size(p,client.get_symbol_info('XAUUSD'),client.get_account_info(),dict(slippage_quote_per_side=.005,max_margin_pct=20),500)
        self.assertIsNotNone(sized)
        self.assertAlmostEqual(sized[0],2.)
        self.assertLessEqual(sized[1],500)
    def test_uncertain_pending_margin_is_not_available_to_another_order(self):
        s=snapshot();client=Terminal(s);r=GoldTurboRuntime.__new__(GoldTurboRuntime);r.client=client
        r.books={'pending':SimpleNamespace(orders={'order':SimpleNamespace(pending_lots=2,unit_margin_money=100)})}
        p=MicroScalper().evaluate(s,COSTS,s.as_of_ms).plan
        self.assertIsNone(r._size(p,client.get_symbol_info('XAUUSD'),client.get_account_info(),dict(slippage_quote_per_side=.005,max_margin_pct=20),2))
    def test_pending_margin_also_consumes_broker_free_margin(self):
        s=snapshot();client=Terminal(s);r=GoldTurboRuntime.__new__(GoldTurboRuntime);r.client=client
        r.books={'pending':SimpleNamespace(orders={'order':SimpleNamespace(pending_lots=.4,unit_margin_money=100)})}
        p=MicroScalper().evaluate(s,COSTS,s.as_of_ms).plan
        self.assertIsNone(r._size(p,client.get_symbol_info('XAUUSD'),dict(client.get_account_info(),free_margin=30),dict(slippage_quote_per_side=.005,max_margin_pct=20),2))

if __name__=='__main__':unittest.main()
