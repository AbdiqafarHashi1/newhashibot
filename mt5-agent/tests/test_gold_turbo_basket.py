"""Basket research invariants. Synthetic quotes/deals, no provider verification."""
from dataclasses import replace
import json
import unittest
from gold_turbo.basket_strategy import BasketScalper, BasketEntryConfig, BASKET_ID
from gold_turbo.basket import BasketBook, BasketEnvelope, BasketConfig, BrokerFacts
from gold_turbo.features import candle_shape
from test_gold_turbo_scalpers import snapshot, COSTS, tick_snapshot
from test_gold_turbo_range_trend import fixture


def candidate(style='burst', side='LONG'):
    snap = snapshot(style, side)
    result = BasketScalper().evaluate(snap, COSTS, snap.as_of_ms)
    if result.plan is None:
        raise AssertionError(result)
    return snap, result


def facts(at):
    return BrokerFacts('account-A', at, 1000, 1000, 100, 1, 100, .01, .01, 1, 'HEDGING',
                       news_clear=True, account_risk_permitted=True)


def setup(config=None, risk=10, margin=250, gross=1):
    snap, decision = candidate()
    at = snap.as_of_ms
    f = facts(at)
    envelope = BasketEnvelope('customer-A', f.account_id, 'basket-A', snap.source, at, at+1_800_000,
                              f.equity, risk, margin, gross)
    book = BasketBook(decision.plan, envelope, f, at, config)
    return book, snap, decision.plan, f


def fill(book, plan, f, lots=.1, leg='main', ticket='ticket-A', price=None):
    order = book.reserve(plan, lots, f, f.observed_at_ms, leg)
    book.entry_fill(order.order_id, 'entry-'+ticket, ticket, lots,
                    plan.reference_entry if price is None else price, .01, f, f.observed_at_ms, True)
    return order


class StrategyTests(unittest.TestCase):
    def test_previous_candle_anticipation_uses_an_observed_inside_bar_break(self):
        snap = snapshot()
        m1 = snap.frames[0]
        prior = replace(m1.completed[-1], open=1999.95, high=2000.08, low=1999.9, close=2000.05)
        m1 = replace(m1, completed=m1.completed[:-1]+(prior,))
        snap = replace(snap, frames=(m1,)+snap.frames[1:])
        results = BasketScalper()._direct_models(snap, COSTS, snap.as_of_ms)
        self.assertTrue(any(d.plan and d.entry_model == 'PREVIOUS_CANDLE_ANTICIPATION' for d in results))

    def test_exhaustion_reversal_requires_observed_reversal_and_rejection(self):
        snap = snapshot()
        m1 = snap.frames[0]
        forming = replace(m1.developing, low=1999.7)
        m1 = replace(m1, developing=forming, developing_shape=candle_shape(forming))
        windows = tuple(replace(w, move=-.2, exhaustion_candidate=True) if w.seconds == 15 else w for w in snap.windows)
        snap = replace(snap, frames=(m1,)+snap.frames[1:], windows=windows)
        results = BasketScalper()._direct_models(snap, COSTS, snap.as_of_ms)
        self.assertTrue(any(d.plan and d.entry_model == 'MICRO_EXHAUSTION_REVERSAL' for d in results))

    def test_flagship_selects_long_short_candidates_with_model_attribution(self):
        for side in ('LONG', 'SHORT'):
            snap, decision = candidate(side=side)
            self.assertEqual(decision.decision, side)
            self.assertEqual(decision.strategy_id, BASKET_ID)
            self.assertTrue(decision.plan.demo_only)
            self.assertIn('selected_source_strategy', dict(decision.features))
            self.assertIn('model_decisions', dict(decision.features))
            self.assertIn('ranking_score_not_probability', dict(decision.features))

    def test_rejection_range_and_momentum_models_are_competed_not_unanimous(self):
        for style in ('impulse', 'compression', 'rejection'):
            snap, result = candidate(style)
            self.assertIsNotNone(result.plan)
        snap = fixture('range')
        result = BasketScalper().evaluate(snap, COSTS, snap.as_of_ms)
        self.assertEqual(result.decision, 'LONG', result)
        self.assertTrue(any(row[2] == 'NO_TRADE' for row in dict(result.features)['model_decisions']))

    def test_admission_and_bad_evidence_do_not_manufacture_new_candidates(self):
        snap, first = candidate()
        engine = BasketScalper()
        first = engine.evaluate(snap, COSTS, snap.as_of_ms)
        engine.record_admission(first, snap.as_of_ms)
        self.assertIsNone(engine.evaluate(snap, COSTS, snap.as_of_ms).plan)
        self.assertEqual(BasketScalper().evaluate(replace(snap, volatility_shock=True), COSTS, snap.as_of_ms).decision, 'NO_TRADE')
        self.assertEqual(BasketScalper().evaluate(snap, None, snap.as_of_ms).decision, 'NO_TRADE')


class ReservationTests(unittest.TestCase):
    def test_original_risk_covers_all_pending_split_orders(self):
        book, snap, plan, f = setup()
        for i in range(40):
            book.reserve(plan, .01, f, snap.as_of_ms, str(i))
        self.assertEqual(len(book.orders), 40)
        self.assertLessEqual(book.committed_risk(f), book.envelope.risk_allowance_money)
        with self.assertRaisesRegex(ValueError, 'RISK'):
            book.reserve(plan, .1, f, snap.as_of_ms, 'too-much')
        self.assertEqual(len(book.orders), 40)

    def test_minimum_lot_never_rounds_up_risk(self):
        book, snap, plan, f = setup(risk=.1)
        with self.assertRaises(ValueError):
            book.reserve(plan, .009, f, snap.as_of_ms)
        with self.assertRaisesRegex(ValueError, 'RISK'):
            book.reserve(plan, .01, f, snap.as_of_ms)
        self.assertFalse(book.orders)

    def test_precision_floor_and_idempotent_normalized_reservation(self):
        book, snap, plan, f = setup()
        one = book.reserve(plan, .019, f, snap.as_of_ms)
        again = book.reserve(plan, .019, f, snap.as_of_ms)
        self.assertEqual(one, again)
        self.assertEqual(one.lots, .01)
        with self.assertRaisesRegex(ValueError, 'CONTENT_CHANGED'):
            book.reserve(plan, .02, f, snap.as_of_ms)

    def test_margin_exposure_operational_and_account_scope_controls(self):
        for field, value in (('free_margin', 0), ('account_id', 'other'), ('environment', 'live'),
                             ('account_mode', 'PROP_FUNDED'), ('news_clear', False), ('account_risk_permitted', False)):
            book, snap, plan, f = setup()
            with self.subTest(field=field), self.assertRaises(ValueError):
                book.reserve(plan, .01, replace(f, **{field:value}), snap.as_of_ms)
        book, snap, plan, f = setup(margin=.5)
        with self.assertRaisesRegex(ValueError, 'MARGIN'):
            book.reserve(plan, .01, f, snap.as_of_ms)
        book, snap, plan, f = setup(gross=.01)
        book.reserve(plan, .01, f, snap.as_of_ms)
        with self.assertRaisesRegex(ValueError, 'EXPOSURE'):
            book.reserve(plan, .01, f, snap.as_of_ms, 'second')
        book, snap, plan, f = setup(BasketConfig(maximum_positions=1))
        book.reserve(plan, .01, f, snap.as_of_ms)
        with self.assertRaisesRegex(ValueError, 'POSITION_LIMIT'):
            book.reserve(plan, .01, f, snap.as_of_ms, 'second')

    def test_netting_requires_isolation_and_does_not_assume_scaling_compatibility(self):
        book, snap, plan, f = setup()
        with self.assertRaisesRegex(ValueError, 'NETTING_UNRELATED'):
            book.reserve(plan, .01, replace(f, position_mode='NETTING', unrelated_xau_exposure=True), snap.as_of_ms)
        netting = replace(f, position_mode='NETTING')
        book.reserve(plan, .01, netting, snap.as_of_ms)
        with self.assertRaisesRegex(ValueError, 'NETTING_SCALING'):
            book.reserve(plan, .01, netting, snap.as_of_ms, 'second')

    def test_pending_uncertainty_does_not_release_risk(self):
        book, snap, plan, f = setup()
        order = book.reserve(plan, .1, f, snap.as_of_ms)
        before = book.committed_risk(f)
        book.entry_uncertain(order.order_id, snap.as_of_ms)
        self.assertEqual(book.committed_risk(f), before)
        book.cancel_confirmed(order.order_id, snap.as_of_ms)
        self.assertEqual(book.committed_risk(f), 0)

    def test_adverse_fill_is_recorded_as_incident_not_discarded(self):
        book, snap, plan, f = setup(risk=1)
        order = book.reserve(plan, .01, f, snap.as_of_ms)
        book.entry_fill(order.order_id, 'adverse', 'owned', .01, plan.reference_entry+2, .01, f, snap.as_of_ms, True)
        self.assertEqual(book.positions['owned'].open_lots, .01)
        self.assertEqual(book.state, 'RECOVERY_REQUIRED')
        result = book.evaluate(snap, f, snap.as_of_ms)
        self.assertEqual(result['state'], 'CLOSING')
        self.assertTrue(any(a.target_id == 'owned' for a in result['actions']))


class AccountingAndClosureTests(unittest.TestCase):
    def test_deal_replay_is_idempotent_and_changed_replay_rejected(self):
        book, snap, plan, f = setup()
        order = fill(book, plan, f)
        before = book.realized_net_money
        book.entry_fill(order.order_id, 'entry-ticket-A', 'ticket-A', .1, plan.reference_entry, .01, f, snap.as_of_ms, True)
        self.assertEqual(book.realized_net_money, before)
        book.exit_fill('ticket-A', 'exit-A', .04, 2000.3, .72, .01, 0, snap.as_of_ms)
        after = book.realized_net_money
        book.exit_fill('ticket-A', 'exit-A', .04, 2000.3, .72, .01, 0, snap.as_of_ms)
        self.assertEqual(book.realized_net_money, after)
        self.assertAlmostEqual(book.positions['ticket-A'].open_lots, .06)
        with self.assertRaisesRegex(ValueError, 'CONTENT_CHANGED'):
            book.exit_fill('ticket-A', 'exit-A', .04, 2000.3, .80, .01, 0, snap.as_of_ms)

    def test_realized_winner_cannot_hide_remaining_floating_loser(self):
        book, snap, plan, f = setup()
        fill(book, plan, f, ticket='winner')
        fill(book, plan, f, leg='second', ticket='loser', price=plan.reference_entry+.4)
        current = tick_snapshot(snap, 2000.3)
        action = book.close_profitable_position('winner', current, f, current.as_of_ms)
        self.assertEqual(action.target_id, 'winner')
        book.exit_fill('winner', 'winner-exit', .1, 2000.3, 1.8, .1, 0, snap.as_of_ms)
        result = book.evaluate(current, f, current.as_of_ms)
        self.assertGreater(result['realized_net_money'], 0)
        self.assertLess(result['floating_net_money'], 0)
        self.assertLess(result['net_money'], 0)
        self.assertEqual(result['state'], 'OPEN')

    def test_losses_remain_debited_after_winners_and_do_not_refill_original_allowance(self):
        book, snap, plan, f = setup()
        fill(book, plan, f, ticket='one')
        fill(book, plan, f, leg='two', ticket='two')
        book.exit_fill('one', 'loss', .1, 1999.8, -3, .1, 0, snap.as_of_ms)
        debit = book.loss_debit_money
        book.exit_fill('two', 'win', .05, 2001, 4, .1, 0, snap.as_of_ms)
        self.assertEqual(book.loss_debit_money, debit)
        self.assertGreater(book.committed_risk(f), debit)
        self.assertEqual(book.envelope.risk_allowance_money, 10)

    def test_experimental_point_four_percent_uses_initial_equity(self):
        book, snap, plan, f = setup(BasketConfig(profit_target_equity_pct=.4, trailing_start_equity_pct=10))
        fill(book, plan, f)
        below = tick_snapshot(snap, plan.reference_entry+.40)
        self.assertIsNone(book.evaluate(below, f, below.as_of_ms)['reason'])
        above = tick_snapshot(snap, plan.reference_entry+.45)
        result = book.evaluate(above, f, above.as_of_ms)
        self.assertEqual(result['reason'], 'NET_BASKET_PROFIT_TARGET')
        self.assertEqual(result['state'], 'CLOSING')
        self.assertGreater(result['net_money'], 4)

    def test_hard_loss_and_peak_trailing_request_all_owned_closures(self):
        book, snap, plan, f = setup()
        fill(book, plan, f)
        loss = tick_snapshot(snap, plan.reference_entry-2)
        self.assertEqual(book.evaluate(loss, f, loss.as_of_ms)['reason'], 'HARD_BASKET_LOSS_OR_RISK_LIMIT')
        book, snap, plan, f = setup(BasketConfig(profit_target_equity_pct=10, trailing_start_equity_pct=.1))
        fill(book, plan, f)
        high = tick_snapshot(snap, plan.reference_entry+.4)
        book.evaluate(high, f, high.as_of_ms)
        retrace = tick_snapshot(snap, plan.reference_entry+.15)
        self.assertEqual(book.evaluate(retrace, f, retrace.as_of_ms)['reason'], 'BASKET_TRAILING_PROFIT_LOCK')

    def test_partial_bulk_close_and_uncertainty_require_reconciliation(self):
        book, snap, plan, f = setup()
        order = book.reserve(plan, .2, f, snap.as_of_ms)
        book.entry_fill(order.order_id, 'partial-entry', 'owned', .1, plan.reference_entry, .01, f, snap.as_of_ms, True)
        actions = book.close_all('test-stop', snap.as_of_ms)
        self.assertEqual({a.kind for a in actions}, {'CANCEL_ORDER', 'CLOSE_POSITION'})
        close = next(a for a in actions if a.kind == 'CLOSE_POSITION')
        book.action_status(close.request_id, 'SENT', snap.as_of_ms)
        book.action_status(close.request_id, 'UNCERTAIN', snap.as_of_ms)
        self.assertNotIn(close.request_id, {a.request_id for a in book.ready_actions()})
        book.exit_fill('owned', 'partial-exit', .04, 2000.2, .32, .01, 0, snap.as_of_ms)
        self.assertNotEqual(book.state, 'CLOSED')
        with self.assertRaisesRegex(ValueError, 'MISSING_PROVIDER_DEALS'):
            book.reconcile_close(close.request_id, 0, snap.as_of_ms, snap.as_of_ms)
        book.reconcile_close(close.request_id, .06, snap.as_of_ms, snap.as_of_ms)
        follow = next(a for a in book.ready_actions() if a.kind == 'CLOSE_POSITION')
        self.assertAlmostEqual(follow.lots, .06)
        self.assertNotEqual(follow.request_id, close.request_id)
        book.cancel_confirmed(order.order_id, snap.as_of_ms)
        book.exit_fill('owned', 'last-exit', .06, 2000.2, .48, .01, 0, snap.as_of_ms)
        self.assertEqual(book.state, 'CLOSED')
        self.assertFalse(book.ready_actions())

    def test_unrelated_position_cannot_be_closed_or_reported_as_ours(self):
        book, snap, plan, f = setup()
        fill(book, plan, f)
        with self.assertRaises(KeyError):
            book.exit_fill('unrelated', 'foreign', .01, 2000, 0, 0, 0, snap.as_of_ms)
        self.assertEqual({a.target_id for a in book.close_all('stop', snap.as_of_ms)}, {'ticket-A'})

    def test_stale_quote_has_no_fabricated_basket_profit(self):
        book, snap, plan, f = setup()
        fill(book, plan, f)
        later = snap.as_of_ms+3000
        result = book.evaluate(snap, replace(f, observed_at_ms=later), later)
        self.assertIsNone(result['net_money'])
        self.assertEqual(result['reason'], 'FRESH_BASKET_QUOTE_REQUIRED')

    def test_account_lock_and_expiry_close_without_new_entry_permission(self):
        book, snap, plan, f = setup()
        fill(book, plan, f)
        result = book.evaluate(snap, replace(f, account_risk_permitted=False), snap.as_of_ms)
        self.assertEqual(result['state'], 'CLOSING')
        with self.assertRaises(ValueError):
            book.reserve(plan, .01, f, snap.as_of_ms, 'forbidden')


class HedgeAndRecoveryTests(unittest.TestCase):
    def test_hedges_require_purpose_broker_mode_ratio_cost_and_original_risk(self):
        _, opposite = candidate(side='SHORT')
        for enabled, purpose in ((False, None), (True, None)):
            config = BasketConfig(hedge_enabled=enabled, hedge_cost_budget_money=1)
            book, snap, plan, f = setup(config)
            fill(book, plan, f)
            with self.assertRaisesRegex(ValueError, 'HEDGE_REQUIRED'):
                book.reserve(opposite.plan, .05, f, snap.as_of_ms, 'hedge', purpose)
        book, snap, plan, f = setup(BasketConfig(hedge_enabled=True, hedge_cost_budget_money=.01))
        fill(book, plan, f)
        with self.assertRaisesRegex(ValueError, 'COST_BUDGET'):
            book.reserve(opposite.plan, .05, f, snap.as_of_ms, 'hedge', 'TEMPORARY_EXPOSURE_REDUCTION')
        book, snap, plan, f = setup(BasketConfig(hedge_enabled=True, hedge_cost_budget_money=1))
        fill(book, plan, f)
        with self.assertRaisesRegex(ValueError, 'HEDGE_EXPOSURE_RATIO'):
            book.reserve(opposite.plan, .06, f, snap.as_of_ms, 'hedge', 'TEMPORARY_EXPOSURE_REDUCTION')
        risk_before = book.committed_risk(f)
        hedge = book.reserve(opposite.plan, .05, f, snap.as_of_ms, 'hedge', 'TEMPORARY_EXPOSURE_REDUCTION')
        self.assertGreater(book.committed_risk(f), risk_before)
        self.assertTrue(hedge.hedge)

    def test_hedge_deadline_does_not_roll_forward_and_requires_exit(self):
        book, snap, plan, f = setup(BasketConfig(hedge_enabled=True, hedge_cost_budget_money=1))
        fill(book, plan, f)
        _, opposite = candidate(side='SHORT')
        hedge = book.reserve(opposite.plan, .05, f, snap.as_of_ms, 'hedge', 'TEMPORARY_EXPOSURE_REDUCTION')
        deadline = book.hedge_deadline_ms
        book.entry_fill(hedge.order_id, 'hedge-fill', 'hedge-ticket', .05, opposite.plan.reference_entry, .01, f, snap.as_of_ms, True)
        later = tick_snapshot(snap, snap.latest_tick.bid, deadline)
        result = book.evaluate(later, replace(f, observed_at_ms=deadline), deadline)
        self.assertEqual(book.hedge_deadline_ms, deadline)
        self.assertTrue(any(a.target_id == 'hedge-ticket' and a.reason == 'HEDGE_DURATION_OR_PURPOSE_ENDED' for a in result['actions']))

    def test_journal_restore_blocks_entries_and_never_resubmits_uncertain_closes(self):
        book, snap, plan, f = setup()
        order = fill(book, plan, f)
        close = book.close_all('disconnect', snap.as_of_ms)[0]
        book.action_status(close.request_id, 'SENT', snap.as_of_ms)
        restored = BasketBook.from_json(book.to_json())
        self.assertEqual(restored.state, 'RECOVERY_REQUIRED')
        self.assertFalse(restored.ready_actions())
        with self.assertRaises(ValueError):
            restored.reserve(plan, .01, f, snap.as_of_ms, 'new')
        with self.assertRaises(ValueError):
            restored.recover(f, {}, [], snap.as_of_ms)
        with self.assertRaises(ValueError):
            restored.recover(f, {'ticket-A':{'lots':.1, 'stop':0}}, [], snap.as_of_ms)
        restored.recover(f, {'ticket-A':{'lots':.1, 'stop':plan.stop}}, [], snap.as_of_ms)
        self.assertEqual(restored.state, 'CLOSING')
        self.assertFalse(restored.ready_actions())
        restored.reconcile_close(close.request_id, .1, snap.as_of_ms, snap.as_of_ms)
        self.assertEqual(len(restored.ready_actions()), 1)
        self.assertEqual(restored.orders[order.order_id].filled_lots, .1)

    def test_recovery_requires_matching_pending_and_all_missing_deals(self):
        book, snap, plan, f = setup()
        order = book.reserve(plan, .1, f, snap.as_of_ms)
        restored = BasketBook.from_json(book.to_json())
        with self.assertRaisesRegex(ValueError, 'PENDING_RECOVERY'):
            restored.recover(f, {}, [], snap.as_of_ms)
        restored.recover(f, {}, [order.order_id], snap.as_of_ms)
        self.assertEqual(restored.state, 'OPEN')
        self.assertAlmostEqual(restored.committed_risk(f), book.committed_risk(f))

    def test_invalid_profiles_do_not_silently_enable_aggressive_risk(self):
        book, snap, plan, f = setup()
        with self.assertRaises(ValueError):
            replace(book.envelope, risk_allowance_money=100)
        with self.assertRaises(ValueError):
            BasketConfig(hedge_enabled=True)
        with self.assertRaises(ValueError):
            BasketEntryConfig(ambiguity_score_gap=2)
        bad = json.loads(book.to_json()); bad['base_plan']['source'] = 'foreign'
        with self.assertRaises(ValueError):
            BasketBook.from_json(json.dumps(bad))


if __name__ == '__main__':
    unittest.main()
