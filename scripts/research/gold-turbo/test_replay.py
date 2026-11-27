"""Targeted accounting and causal-data tests for the scenario replay, no strategy tuning."""
import importlib.util
from pathlib import Path
import sys
import tempfile

HERE=Path(__file__).resolve().parent
sys.path=[v for v in sys.path if Path(v).resolve()!=HERE]
import unittest

spec=importlib.util.spec_from_file_location('turbo_replay',HERE/'replay.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)


class ReplayTests(unittest.TestCase):
    def terminal(self,side='buy'):
        t=m.ScenarioTerminal(1000);t.quote(100000,2000,2000.1)
        payload=dict(volume=.02,side=side,sl=1999 if side=='buy' else 2001.1,tp=2002 if side=='buy' else 1998,comment='ht:test',authorized_risk_amount=3)
        self.assertTrue(t.place_order(payload)['success']);return t
    def test_long_stop_gap_fills_at_observed_bid_less_slippage(self):
        t=self.terminal();t.quote(101000,1998,1998.2)
        self.assertFalse(t.positions);exit=t.fills[-1]
        self.assertEqual(exit['price'],1997.98)
        self.assertAlmostEqual(t.balance,1000+sum(d['profit']+d['commission'] for d in t.fills))
        self.assertEqual(exit['reason'],'BROKER_STOP_OBSERVED_QUOTE')
    def test_short_stop_uses_ask_and_realizes_both_commissions(self):
        t=self.terminal('sell');t.quote(101000,2001,2001.5)
        self.assertAlmostEqual(t.fills[-1]['price'],2001.52)
        self.assertAlmostEqual(sum(d['commission'] for d in t.fills),-.14)
        self.assertLess(t.balance,1000)
    def test_partial_exit_cannot_increase_or_hide_remaining_exposure(self):
        t=self.terminal();t.quote(101000,2000.5,2000.6);t.close_position('1',.01)
        self.assertAlmostEqual(t.positions[0]['quantity'],.01)
        t.close_position('1');self.assertFalse(t.positions)
        self.assertAlmostEqual(t.balance,1000+sum(d['profit']+d['commission'] for d in t.fills))
    def test_insufficient_original_risk_is_rejected_without_receipt_of_fill(self):
        t=m.ScenarioTerminal(1000);t.quote(100000,2000,2000.1)
        r=t.place_order(dict(volume=.01,side='buy',sl=1999,tp=2002,comment='x',authorized_risk_amount=.1))
        self.assertFalse(r['success']);self.assertFalse(t.fills);self.assertFalse(t.positions)
    def test_breakeven_filled_basket_counts_but_unfilled_rejection_does_not(self):
        t=m.ScenarioTerminal(1000)
        t.baskets=[dict(net=0.,orders=1,filled_orders=1),dict(net=0.,orders=1,filled_orders=0),dict(net=2.,orders=2,filled_orders=2)]
        r=m.summarize(t,'fixture')
        self.assertEqual(r['independent_baskets'],2)
        self.assertEqual(r['win_rate_pct'],50.)
        self.assertEqual(r['expectancy_money'],1.)
    def test_completed_context_never_releases_future_bar(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'synthetic-bars.json'
            rows=[dict(open_time=f'2026-10-06T12:{i:02}:00Z',open=2000.,high=2001.,low=1999.,close=2000.,volume=10) for i in range(30)]
            path.write_text(m.json.dumps(rows));bs=m.bars(path)
        now=int(m.pd.Timestamp('2026-10-06T12:15Z').value//1000000)
        for tf,rows in bs.items():
            ends=[r.end_ms for r in rows];j=m.bisect_right(ends,now)
            self.assertTrue(all(r.end_ms<=now for r in rows[max(0,j-64):j]))
            self.assertGreater(rows[j].end_ms,now)
            self.assertEqual(rows[j-1].end_ms,now)

if __name__=='__main__':unittest.main()
