"""Cash, margin, gap and partial-exit invariants for the OHLC research screen."""
import unittest
from crypto_personal_screen import Account

SPEC={'X':dict(liquidationFee='.01',filters=[dict(filterType='LOT_SIZE',stepSize='.001',minQty='.001',maxQty='100000'),dict(filterType='PRICE_FILTER',tickSize='.01'),dict(filterType='MIN_NOTIONAL',notional='5')])}
SIGNAL=dict(strategy_id='test',symbol='X',side=1,stop=95.,target=110.,reference=100.,tp1=105.,partial_fraction=0.,maximum_hold_ms=86400000)

def account(risk=1,leverage=10,capital=1000):
    return Account('test',['test'],capital,risk,leverage,False,SPEC,0,86400000)

def enter(a,signal=None):
    a.step(0,{}, {'X':dict(t=0,o=100.)},[signal or SIGNAL],{}, {'X':100.})
    return a

class CryptoScreenTests(unittest.TestCase):
    def test_leverage_does_not_multiply_same_position_profit(self):
        results=[]
        for lev in (1,10):
            a=enter(account(leverage=lev));a.exit('X',110.,60000,'TEST');results.append(a.finish({'X':110.}))
        self.assertAlmostEqual(results[0]['ending_balance'],results[1]['ending_balance'])

    def test_margin_capacity_reduces_volume_without_raising_risk(self):
        a=enter(account(risk=5,leverage=1),dict(SIGNAL,stop=99.,target=104.))
        self.assertIn('X',a.positions)
        self.assertLessEqual(a.margin()+a.fees,500.)
        self.assertLessEqual(a.positions['X']['initial_risk'],50.)

    def test_more_risk_increases_both_profit_and_loss(self):
        outcomes={}
        for reference in (90.,110.):
            for risk in (1,3):
                a=enter(account(risk=risk));a.exit('X',reference,60000,'TEST');outcomes[reference,risk]=a.balance-1000
        self.assertGreater(outcomes[110.,3],outcomes[110.,1])
        self.assertLess(outcomes[90.,3],outcomes[90.,1])

    def test_minimum_notional_never_forces_rounding_up(self):
        a=enter(account(capital=1))
        self.assertFalse(a.positions)
        self.assertEqual(a.blocked['MINIMUM_EXECUTABLE_VOLUME'],1)

    def test_missing_next_bar_rejects_entry(self):
        a=account();a.step(0,{}, {},[SIGNAL],{}, {'X':100.})
        self.assertFalse(a.positions)
        self.assertEqual(a.blocked['NO_NEXT_NATIVE_BAR'],1)

    def test_funding_is_not_charged_before_entry_and_uses_positive_mark(self):
        a=account();f={'X':[dict(markPrice='100',fundingRate='.001')]}
        a.step(0,{}, {'X':dict(t=0,o=100.)},[SIGNAL],f, {'X':100.})
        self.assertEqual(a.funding_net,0.)
        qty=a.positions['X']['qty']
        a.step(60000,{}, {},[],{'X':[dict(markPrice='0',fundingRate='.001')]},{'X':100.})
        self.assertAlmostEqual(a.funding_net,qty*.1)
        self.assertEqual(a.events['FUNDING_MARK_PROXY'],1)
        a.finish({'X':100.})  # Includes funding in the exact cash audit.

    def test_stop_wins_when_ohlc_cannot_resolve_stop_target_order(self):
        a=enter(account());a.process_bar('X',dict(t=0,o=100.,h=125.,l=85.,c=110.),60000)
        self.assertEqual(a.decisions[0]['reason'],'STOP_FIRST_OHLC')
        self.assertLess(a.decisions[0]['net'],0.)
        a.finish({'X':110.})

    def test_gap_executes_at_observed_worse_price(self):
        a=enter(account());a.process_bar('X',dict(t=0,o=80.,h=85.,l=75.,c=82.),60000)
        self.assertLess(a.fills[0]['exit'],80.)
        self.assertEqual(a.decisions[0]['reason'],'GAP_LIQUIDATION_SCENARIO')
        a.finish({'X':82.})

    def test_partial_exit_and_same_bar_break_even_reconcile(self):
        a=enter(account(),dict(SIGNAL,partial_fraction=.5))
        a.process_bar('X',dict(t=0,o=101.,h=115.,l=99.,c=112.),60000)
        self.assertEqual(len(a.fills),2)
        self.assertEqual(len(a.decisions),1)
        self.assertEqual(a.decisions[0]['reason'],'CONSERVATIVE_SAME_BAR_BE')
        a.finish({'X':112.})

if __name__=='__main__':unittest.main()
