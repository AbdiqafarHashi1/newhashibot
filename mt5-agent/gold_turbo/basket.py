"""Demo research basket accounting and reconciled action proposals.

No broker calls, account authorization or disk writes. Account money is explicit;
quote conversion and per-lot margin are supplied observations/scenarios, not an
invented broker specification. Period 6 must supply authenticated fresh facts,
provider reconciliation, durable journal writes and account-wide risk controls.
"""
from dataclasses import dataclass, asdict, replace
from decimal import Decimal, ROUND_FLOOR
import hashlib
import json
import math
from .contracts import integer, positive
from .strategy_contracts import EntryPlan, common_rejection
from .basket_strategy import BASKET_ID


def nonnegative(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(name)


@dataclass(frozen=True)
class BrokerFacts:
    account_id: str
    observed_at_ms: int
    equity: float
    free_margin: float
    contract_size: float
    quote_to_account_rate: float
    margin_per_lot: float
    volume_min: float
    volume_step: float
    volume_max: float
    position_mode: str
    environment: str = 'demo'
    account_mode: str = 'PERSONAL'
    news_clear: bool = False
    account_risk_permitted: bool = False
    unrelated_xau_exposure: bool = False

    def __post_init__(self):
        if not isinstance(self.account_id, str) or not self.account_id:
            raise ValueError('ACCOUNT_ID_REQUIRED')
        integer(self.observed_at_ms, 'BROKER_FACT_TIME_INVALID', 1)
        for name in ('equity', 'contract_size', 'quote_to_account_rate', 'margin_per_lot', 'volume_min', 'volume_step', 'volume_max'):
            positive(getattr(self, name), 'BROKER_FACT_INVALID:'+name)
        nonnegative(self.free_margin, 'FREE_MARGIN_INVALID')
        if self.volume_min > self.volume_max or self.position_mode not in ('HEDGING', 'NETTING'):
            raise ValueError('BROKER_VOLUME_OR_POSITION_MODE_INVALID')
        for value in (self.news_clear, self.account_risk_permitted, self.unrelated_xau_exposure):
            if type(value) is not bool:
                raise ValueError('EXPLICIT_BROKER_EVIDENCE_REQUIRED')


@dataclass(frozen=True)
class BasketEnvelope:
    customer_id: str
    account_id: str
    basket_id: str
    source: str
    created_at_ms: int
    expires_at_ms: int
    initial_equity: float
    risk_allowance_money: float
    maximum_margin_money: float
    maximum_gross_lots: float
    account_currency: str = 'USD'
    experimental_risk: bool = False

    def __post_init__(self):
        for value in (self.customer_id, self.account_id, self.basket_id, self.source, self.account_currency):
            if not isinstance(value, str) or not value:
                raise ValueError('BASKET_IDENTITY_REQUIRED')
        integer(self.created_at_ms, 'BASKET_TIME_INVALID', 1)
        integer(self.expires_at_ms, 'BASKET_EXPIRY_INVALID', 1)
        if self.expires_at_ms <= self.created_at_ms or type(self.experimental_risk) is not bool:
            raise ValueError('BASKET_EXPIRY_OR_PROFILE_INVALID')
        for name in ('initial_equity', 'risk_allowance_money', 'maximum_margin_money', 'maximum_gross_lots'):
            positive(getattr(self, name), 'BASKET_ENVELOPE_INVALID:'+name)
        if not self.experimental_risk and self.risk_allowance_money > .02*self.initial_equity:
            raise ValueError('EXPERIMENTAL_BASKET_RISK_REQUIRES_EXPLICIT_PROFILE')


@dataclass(frozen=True)
class BasketConfig:
    profit_target_equity_pct: float = .20
    trailing_start_equity_pct: float = .15
    trailing_keep_fraction: float = .50
    maximum_age_ms: int = 300_000
    maximum_facts_age_ms: int = 2000
    maximum_positions: object = None
    maximum_orders: int = 5000
    hedge_enabled: bool = False
    hedge_maximum_ratio: float = .50
    hedge_cost_budget_money: float = 0.0
    hedge_maximum_duration_ms: int = 30_000

    def __post_init__(self):
        for name in ('profit_target_equity_pct', 'trailing_start_equity_pct', 'trailing_keep_fraction', 'hedge_maximum_ratio'):
            positive(getattr(self, name), 'BASKET_CONFIG_INVALID:'+name)
        for name in ('maximum_age_ms', 'maximum_facts_age_ms', 'maximum_orders', 'hedge_maximum_duration_ms'):
            integer(getattr(self, name), 'BASKET_CONFIG_TIME_INVALID:'+name, 1)
        if self.maximum_positions is not None:
            integer(self.maximum_positions, 'BASKET_POSITION_CAP_INVALID', 1)
        nonnegative(self.hedge_cost_budget_money, 'HEDGE_COST_BUDGET_INVALID')
        if type(self.hedge_enabled) is not bool or not 0 < self.trailing_keep_fraction < 1 or not 0 < self.hedge_maximum_ratio <= 1:
            raise ValueError('BASKET_HEDGE_OR_TRAILING_INVALID')
        if self.hedge_enabled and self.hedge_cost_budget_money <= 0:
            raise ValueError('EXPLICIT_HEDGE_COST_BUDGET_REQUIRED')


@dataclass(frozen=True)
class Reservation:
    order_id: str
    plan: EntryPlan
    lots: float
    filled_lots: float
    unit_risk_money: float
    unit_margin_money: float
    hedge: bool
    status: str = 'RESERVED'

    @property
    def pending_lots(self):
        return max(0.0, self.lots-self.filled_lots) if self.status not in ('CANCELLED', 'FILLED') else 0.0


@dataclass(frozen=True)
class BasketPosition:
    ticket: str
    order_id: str
    side: str
    entry_price: float
    open_lots: float
    original_stop: float
    observed_stop: float
    hedge: bool
    accrued_carry_money: float = 0.0


@dataclass(frozen=True)
class BasketAction:
    request_id: str
    kind: str
    target_id: str
    lots: float
    reason: str
    attempt: int = 0
    status: str = 'READY'


class BasketBook:
    schema = 'gold-turbo-basket/v1'

    def __init__(self, plan, envelope, facts, now_ms, config=None):
        self.envelope = envelope
        self.config = config or BasketConfig()
        if not isinstance(plan, EntryPlan) or plan.strategy_id != BASKET_ID or not isinstance(envelope, BasketEnvelope) or not isinstance(self.config, BasketConfig):
            raise ValueError('BASKET_PLAN_AND_ENVELOPE_REQUIRED')
        if plan.source != envelope.source or not envelope.created_at_ms <= now_ms < envelope.expires_at_ms:
            raise ValueError('BASKET_SCOPE_OR_EXPIRY_INVALID')
        self.base_plan, self.base_side = plan, plan.side
        self.orders, self.positions, self.actions = {}, {}, {}
        self.deals, self.events = {}, []
        self.realized_net_money = self.loss_debit_money = self.peak_net_money = 0.0
        self.hedge_cost_committed = 0.0
        self.hedge_deadline_ms = None
        self.last_at_ms, self.state = now_ms, 'OPEN'
        self._resume_state = 'OPEN'
        self._facts(facts, now_ms, entry=True)
        if abs(facts.equity-envelope.initial_equity) > max(.01, facts.equity*.001):
            raise ValueError('INITIAL_EQUITY_MUST_MATCH_OBSERVATION')
        self._event(now_ms, 'BASKET_CREATED', risk_allowance=envelope.risk_allowance_money)

    def _event(self, at, event, **details):
        self.events.append(dict(at_ms=at, event=event, **details))

    def _clock(self, now):
        integer(now, 'BASKET_CLOCK_INVALID', 1)
        if now < self.last_at_ms:
            raise ValueError('BASKET_CLOCK_REVERSED')
        self.last_at_ms = now

    def _facts(self, facts, now, entry=False):
        if not isinstance(facts, BrokerFacts) or facts.account_id != self.envelope.account_id:
            raise ValueError('ACCOUNT_SCOPE_MISMATCH')
        if facts.environment != 'demo' or facts.account_mode != 'PERSONAL':
            raise ValueError('PERSONAL_DEMO_ONLY')
        if not 0 <= now-facts.observed_at_ms <= self.config.maximum_facts_age_ms:
            raise ValueError('BROKER_FACTS_STALE')
        if facts.position_mode == 'NETTING' and facts.unrelated_xau_exposure:
            raise ValueError('NETTING_UNRELATED_POSITION_CONFLICT')
        if entry and (not facts.news_clear or not facts.account_risk_permitted):
            raise ValueError('NEWS_OR_ACCOUNT_RISK_BLOCKED')

    def committed_risk(self, facts):
        multiplier = facts.contract_size*facts.quote_to_account_rate
        opened = sum((abs(p.entry_price-p.original_stop)+.5*self.orders[p.order_id].plan.fee_slippage_price)*p.open_lots*multiplier
                     for p in self.positions.values())
        pending = sum(o.pending_lots*o.plan.planned_loss_with_costs*multiplier for o in self.orders.values())
        return self.loss_debit_money+opened+pending

    def gross_lots(self):
        return sum(p.open_lots for p in self.positions.values())+sum(o.pending_lots for o in self.orders.values())

    def reserve(self, plan, requested_lots, facts, now_ms, leg_key='main', hedge_purpose=None):
        self._clock(now_ms)
        self._facts(facts, now_ms, entry=True)
        if self.state != 'OPEN' or now_ms >= self.envelope.expires_at_ms:
            raise ValueError('BASKET_NOT_OPEN_OR_EXPIRED')
        if any(a.status != 'RESOLVED' for a in self.actions.values()):
            raise ValueError('BASKET_ACTION_RECONCILIATION_REQUIRED')
        if plan.strategy_id != BASKET_ID or plan.source != self.envelope.source or not plan.demo_only:
            raise ValueError('BASKET_PLAN_SCOPE_MISMATCH')
        if not plan.created_at_ms <= now_ms <= plan.expires_at_ms:
            raise ValueError('ENTRY_PLAN_EXPIRED')
        if not isinstance(leg_key, str) or not leg_key:
            raise ValueError('LEG_KEY_REQUIRED')
        positive(requested_lots, 'REQUESTED_VOLUME_INVALID')
        order_id = hashlib.sha256(f'{self.envelope.basket_id}:{plan.opportunity_id}:{leg_key}'.encode()).hexdigest()
        if requested_lots < facts.volume_min or requested_lots > facts.volume_max:
            raise ValueError('BROKER_MINIMUM_OR_MAXIMUM_VOLUME')
        step = Decimal(str(facts.volume_step)); minimum = Decimal(str(facts.volume_min))
        lots = float(minimum+((Decimal(str(requested_lots))-minimum)/step).to_integral_value(rounding=ROUND_FLOOR)*step)
        if order_id in self.orders:
            original = self.orders[order_id]
            if original.plan != plan or abs(original.lots-lots) > 1e-9:
                raise ValueError('DUPLICATE_ORDER_CONTENT_CHANGED')
            return original
        if len(self.orders) >= self.config.maximum_orders:
            raise ValueError('OPERATIONAL_ORDER_LIMIT')
        if facts.position_mode == 'NETTING' and self.orders:
            raise ValueError('NETTING_SCALING_REQUIRES_VERIFIED_ADAPTER')
        if self.config.maximum_positions is not None:
            active = sum(p.open_lots > 0 for p in self.positions.values())+sum(o.pending_lots > 0 for o in self.orders.values())
            if active >= self.config.maximum_positions:
                raise ValueError('OPERATIONAL_POSITION_LIMIT')
        hedge = plan.side != self.base_side
        new_hedge_cost = 0.0
        if hedge:
            if not self.config.hedge_enabled or facts.position_mode != 'HEDGING' or hedge_purpose != 'TEMPORARY_EXPOSURE_REDUCTION':
                raise ValueError('DEFINED_COMPATIBLE_HEDGE_REQUIRED')
            if self.hedge_deadline_ms is not None and now_ms >= self.hedge_deadline_ms:
                raise ValueError('HEDGE_DURATION_EXPIRED')
            base = sum(p.open_lots for p in self.positions.values() if not p.hedge)
            already = sum(p.open_lots for p in self.positions.values() if p.hedge)+sum(o.pending_lots for o in self.orders.values() if o.hedge)
            if already+lots > base*self.config.hedge_maximum_ratio+1e-9:
                raise ValueError('HEDGE_EXPOSURE_RATIO_EXCEEDED')
            new_hedge_cost = lots*(plan.spread_at_entry+plan.fee_slippage_price)*facts.contract_size*facts.quote_to_account_rate
            if self.hedge_cost_committed+new_hedge_cost > self.config.hedge_cost_budget_money+1e-9:
                raise ValueError('HEDGE_COST_BUDGET_EXCEEDED')
        multiplier = facts.contract_size*facts.quote_to_account_rate
        unit_risk = plan.planned_loss_with_costs*multiplier
        if self.committed_risk(facts)+unit_risk*lots > self.envelope.risk_allowance_money+1e-9:
            raise ValueError('ORIGINAL_BASKET_RISK_EXCEEDED')
        if self.gross_lots()+lots > self.envelope.maximum_gross_lots+1e-9:
            raise ValueError('GROSS_EXPOSURE_EXCEEDED')
        pending_margin = sum(o.pending_lots*o.unit_margin_money for o in self.orders.values())
        total_margin = (sum(p.open_lots for p in self.positions.values())+lots)*facts.margin_per_lot+pending_margin
        if total_margin > self.envelope.maximum_margin_money+1e-9 or lots*facts.margin_per_lot+pending_margin > facts.free_margin+1e-9:
            raise ValueError('BASKET_MARGIN_EXCEEDED')
        order = Reservation(order_id, plan, lots, 0.0, unit_risk, facts.margin_per_lot, hedge)
        self.orders[order_id] = order
        self.hedge_cost_committed += new_hedge_cost
        if hedge and self.hedge_deadline_ms is None:
            self.hedge_deadline_ms = now_ms+self.config.hedge_maximum_duration_ms
        self._event(now_ms, 'ORDER_RESERVED', order_id=order_id, lots=lots, side=plan.side,
                    model=plan.entry_model, hedge=hedge, committed_risk=self.committed_risk(facts))
        return order

    def _deal_once(self, deal_id, content):
        if not isinstance(deal_id, str) or not deal_id:
            raise ValueError('PROVIDER_DEAL_ID_REQUIRED')
        fingerprint = json.dumps(content, sort_keys=True)
        if deal_id in self.deals:
            if self.deals[deal_id] != fingerprint:
                raise ValueError('PROVIDER_DEAL_CONTENT_CHANGED')
            return False
        return True

    def entry_uncertain(self, order_id, now_ms):
        self._clock(now_ms)
        order = self.orders[order_id]
        if order.pending_lots <= 0:
            raise ValueError('NO_PENDING_ENTRY_REMAINDER')
        self.orders[order_id] = replace(order, status='UNCERTAIN')
        self._event(now_ms, 'ENTRY_SUBMISSION_UNCERTAIN', order_id=order_id)

    def entry_fill(self, order_id, deal_id, ticket, lots, price, commission_money, facts, now_ms, protection_confirmed):
        self._clock(now_ms); self._facts(facts, now_ms)
        positive(lots, 'FILL_VOLUME_INVALID'); positive(price, 'FILL_PRICE_INVALID')
        nonnegative(commission_money, 'FILL_COMMISSION_INVALID')
        if not isinstance(ticket, str) or not ticket or type(protection_confirmed) is not bool:
            raise ValueError('TICKET_AND_PROTECTION_EVIDENCE_REQUIRED')
        order = self.orders[order_id]
        content = dict(kind='ENTRY', order_id=order_id, ticket=ticket, lots=lots, price=price, commission=commission_money)
        if not self._deal_once(deal_id, content):
            return
        previous = self.positions.get(ticket)
        if previous and previous.order_id != order_id:
            self.state = 'RECOVERY_REQUIRED'
            self._event(now_ms, 'NETTED_FILL_REQUIRES_RECONCILIATION', **content)
            raise ValueError('NETTED_FILL_OWNERSHIP_CONFLICT')
        quantity = lots+(previous.open_lots if previous else 0)
        average = (price*lots+previous.entry_price*previous.open_lots)/quantity if previous else price
        self.positions[ticket] = BasketPosition(ticket, order_id, order.plan.side, average, quantity,
            order.plan.stop, previous.observed_stop if previous else order.plan.stop, order.hedge,
            previous.accrued_carry_money if previous else 0)
        self.realized_net_money -= commission_money
        self.loss_debit_money += commission_money
        filled = order.filled_lots+lots
        self.orders[order_id] = replace(order, filled_lots=filled,
            status='FILLED' if filled >= order.lots-1e-9 else 'PARTIAL')
        self.deals[deal_id] = json.dumps(content, sort_keys=True)
        sign = 1 if order.plan.side == 'LONG' else -1
        incident = (not protection_confirmed or order.status == 'CANCELLED' or filled > order.lots+1e-9
                    or sign*(price-order.plan.stop) <= 0 or self.committed_risk(facts) > self.envelope.risk_allowance_money+1e-9)
        if incident:
            self.state = 'RECOVERY_REQUIRED'
        self._event(now_ms, 'ENTRY_FILL_INCIDENT' if incident else 'ENTRY_FILL', deal_id=deal_id,
                    **content, realized_net=self.realized_net_money)

    def exit_fill(self, ticket, deal_id, lots, exit_price, gross_money, commission_money, swap_money, now_ms):
        self._clock(now_ms)
        positive(lots, 'EXIT_VOLUME_INVALID'); positive(exit_price, 'EXIT_PRICE_INVALID')
        nonnegative(commission_money, 'EXIT_COMMISSION_INVALID')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (gross_money, swap_money)):
            raise ValueError('PROVIDER_REALIZED_MONEY_REQUIRED')
        content = dict(kind='EXIT', ticket=ticket, lots=lots, exit_price=exit_price,
                       gross=gross_money, commission=commission_money, swap=swap_money)
        if not self._deal_once(deal_id, content):
            return
        position = self.positions[ticket]
        if lots > position.open_lots+1e-9:
            raise ValueError('EXIT_EXCEEDS_OWNED_VOLUME')
        net = gross_money-commission_money+swap_money
        self.realized_net_money += net
        self.loss_debit_money += max(-net, 0)
        remaining = max(0, position.open_lots-lots)
        self.positions[ticket] = replace(position, open_lots=remaining,
                                        accrued_carry_money=position.accrued_carry_money*remaining/position.open_lots)
        for key, action in list(self.actions.items()):
            if action.kind == 'CLOSE_POSITION' and action.target_id == ticket and action.status != 'RESOLVED':
                self.actions[key] = replace(action, status='RESOLVED' if remaining <= 1e-9 else 'UNCERTAIN')
        self.deals[deal_id] = json.dumps(content, sort_keys=True)
        self._event(now_ms, 'EXIT_FILL', deal_id=deal_id, **content, net=net, remaining_lots=remaining)
        self._finish_if_flat()

    def mark_carry(self, ticket, accrued_money, now_ms):
        self._clock(now_ms)
        if isinstance(accrued_money, bool) or not isinstance(accrued_money, (int, float)) or not math.isfinite(accrued_money):
            raise ValueError('ACCRUED_CARRY_INVALID')
        self.positions[ticket] = replace(self.positions[ticket], accrued_carry_money=accrued_money)

    def _finish_if_flat(self):
        if self.orders and not any(p.open_lots > 1e-9 for p in self.positions.values()) and not any(o.pending_lots > 1e-9 for o in self.orders.values()):
            self.state = 'CLOSED'

    def _action(self, kind, target, lots, reason):
        previous = [a for a in self.actions.values() if a.kind == kind and a.target_id == target]
        unresolved = [a for a in previous if a.status not in ('RESOLVED',)]
        if unresolved:
            return unresolved[-1]
        attempt = len(previous)
        key = f'{self.envelope.basket_id}:{kind}:{target}:{attempt}'
        request = BasketAction(hashlib.sha256(key.encode()).hexdigest(), kind, target, lots, reason, attempt)
        self.actions[request.request_id] = request
        return request

    def close_all(self, reason, now_ms):
        self._clock(now_ms)
        if self.state == 'CLOSED':
            return ()
        self.state = 'CLOSING'
        for o in self.orders.values():
            if o.pending_lots > 1e-9:
                self._action('CANCEL_ORDER', o.order_id, o.pending_lots, reason)
        for p in self.positions.values():
            if p.open_lots > 1e-9:
                self._action('CLOSE_POSITION', p.ticket, p.open_lots, reason)
        self._event(now_ms, 'CLOSE_ALL_REQUESTED', reason=reason)
        self._finish_if_flat()
        return self.ready_actions()

    def ready_actions(self):
        return tuple(a for a in self.actions.values() if a.status == 'READY')

    def action_status(self, request_id, status, now_ms):
        self._clock(now_ms)
        if status not in ('SENT', 'UNCERTAIN', 'REJECTED'):
            raise ValueError('ACTION_STATUS_INVALID')
        action = self.actions[request_id]
        if action.status == 'RESOLVED' or (status == 'SENT' and action.status != 'READY'):
            raise ValueError('ACTION_RECONCILIATION_REQUIRED')
        self.actions[request_id] = replace(action, status=status)
        self._event(now_ms, 'ACTION_STATUS', request_id=request_id, status=status)

    def cancel_confirmed(self, order_id, now_ms):
        self._clock(now_ms)
        self.orders[order_id] = replace(self.orders[order_id], status='CANCELLED')
        for key, action in list(self.actions.items()):
            if action.kind == 'CANCEL_ORDER' and action.target_id == order_id:
                self.actions[key] = replace(action, status='RESOLVED')
        self._event(now_ms, 'UNFILLED_REMAINDER_CANCEL_CONFIRMED', order_id=order_id)
        self._finish_if_flat()

    def reconcile_close(self, request_id, observed_open_lots, observed_at_ms, now_ms):
        self._clock(now_ms)
        nonnegative(observed_open_lots, 'OBSERVED_VOLUME_INVALID')
        if not 0 <= now_ms-observed_at_ms <= self.config.maximum_facts_age_ms:
            raise ValueError('RECONCILIATION_STALE')
        action = self.actions[request_id]
        if action.kind != 'CLOSE_POSITION':
            raise ValueError('POSITION_CLOSE_REQUEST_REQUIRED')
        position = self.positions[action.target_id]
        if abs(position.open_lots-observed_open_lots) > 1e-9:
            raise ValueError('MISSING_PROVIDER_DEALS_RECONCILE_FIRST')
        self.actions[request_id] = replace(action, status='RESOLVED')
        if observed_open_lots > 1e-9 and self.state == 'CLOSING':
            self._action('CLOSE_POSITION', position.ticket, observed_open_lots, action.reason)
        self._finish_if_flat()

    def evaluate(self, snapshot, facts, now_ms):
        self._clock(now_ms)
        self._facts(facts, now_ms)
        if snapshot.source != self.envelope.source or snapshot.symbol != 'XAUUSD':
            raise ValueError('BASKET_MARK_SCOPE_MISMATCH')
        reason = None
        if self.state == 'RECOVERY_REQUIRED':
            reason = 'BASKET_RECOVERY_INCIDENT'
        elif now_ms >= self.envelope.expires_at_ms or now_ms-self.envelope.created_at_ms >= self.config.maximum_age_ms:
            reason = 'BASKET_EXPIRY_OR_TIMEOUT'
        elif not facts.account_risk_permitted:
            reason = 'ACCOUNT_RISK_LOCK'
        if reason:
            self.close_all(reason, now_ms)
        blocked = common_rejection(snapshot, now_ms, self.config.maximum_facts_age_ms)
        if blocked and blocked not in ('SPREAD_SPIKE', 'VOLATILITY_SHOCK'):
            return dict(state=self.state, net_money=None, realized_net_money=self.realized_net_money,
                        reason='FRESH_BASKET_QUOTE_REQUIRED', actions=self.ready_actions())
        tick = snapshot.latest_tick
        multiplier = facts.contract_size*facts.quote_to_account_rate
        floating = 0.0
        for p in self.positions.values():
            sign = 1 if p.side == 'LONG' else -1
            price = tick.bid if sign == 1 else tick.ask
            reserve = .5*self.orders[p.order_id].plan.fee_slippage_price
            floating += (sign*(price-p.entry_price)-reserve)*p.open_lots*multiplier+p.accrued_carry_money
        net = self.realized_net_money+floating
        self.peak_net_money = max(self.peak_net_money, net)
        if net <= -self.envelope.risk_allowance_money or self.committed_risk(facts) > self.envelope.risk_allowance_money+1e-9:
            reason = 'HARD_BASKET_LOSS_OR_RISK_LIMIT'
        elif snapshot.volatility_shock:
            reason = 'BASKET_VOLATILITY_SHOCK'
        elif (1 if self.base_side == 'LONG' else -1)*(tick.bid-self.base_plan.invalidation_bid) <= 0:
            reason = 'BASKET_DIRECTIONAL_INVALIDATION'
        elif net >= self.envelope.initial_equity*self.config.profit_target_equity_pct/100:
            reason = 'NET_BASKET_PROFIT_TARGET'
        elif self.peak_net_money >= self.envelope.initial_equity*self.config.trailing_start_equity_pct/100 and net <= self.peak_net_money*self.config.trailing_keep_fraction:
            reason = 'BASKET_TRAILING_PROFIT_LOCK'
        if reason:
            self.close_all(reason, now_ms)
        elif self.hedge_deadline_ms is not None and (now_ms >= self.hedge_deadline_ms or net >= 0 or not any(p.open_lots > 0 and not p.hedge for p in self.positions.values())):
            for o in self.orders.values():
                if o.hedge and o.pending_lots > 0:
                    self._action('CANCEL_ORDER', o.order_id, o.pending_lots, 'HEDGE_DURATION_OR_PURPOSE_ENDED')
            for p in self.positions.values():
                if p.hedge and p.open_lots > 0:
                    self._action('CLOSE_POSITION', p.ticket, p.open_lots, 'HEDGE_DURATION_OR_PURPOSE_ENDED')
        margin = sum(p.open_lots for p in self.positions.values())*facts.margin_per_lot+sum(o.pending_lots*o.unit_margin_money for o in self.orders.values())
        if margin > self.envelope.maximum_margin_money+1e-9 or self.gross_lots() > self.envelope.maximum_gross_lots+1e-9:
            reason = 'BASKET_MARGIN_OR_EXPOSURE_LIMIT'
            self.close_all(reason, now_ms)
        self._event(now_ms, 'BASKET_MARK', net=net, floating=floating, realized=self.realized_net_money,
                    committed_risk=self.committed_risk(facts), margin=margin, gross_lots=self.gross_lots())
        return dict(state=self.state, net_money=net, floating_net_money=floating, realized_net_money=self.realized_net_money,
                    committed_risk_money=self.committed_risk(facts), margin_money=margin, reason=reason,
                    actions=self.ready_actions())

    def close_profitable_position(self, ticket, snapshot, facts, now_ms):
        mark = self.evaluate(snapshot, facts, now_ms)
        if self.state != 'OPEN' or mark['net_money'] is None:
            return None
        position = self.positions[ticket]
        sign = 1 if position.side == 'LONG' else -1
        price = snapshot.latest_tick.bid if sign == 1 else snapshot.latest_tick.ask
        reserve = .5*self.orders[position.order_id].plan.fee_slippage_price
        if (sign*(price-position.entry_price)-reserve)*position.open_lots*facts.contract_size*facts.quote_to_account_rate+position.accrued_carry_money <= 0:
            raise ValueError('POSITION_NOT_NET_PROFITABLE')
        return self._action('CLOSE_POSITION', ticket, position.open_lots, 'INDIVIDUAL_NET_PROFIT_CAPTURE')

    def to_json(self):
        return json.dumps(dict(schema=self.schema, envelope=asdict(self.envelope), config=asdict(self.config),
            base_plan=asdict(self.base_plan), orders={k:asdict(v) for k,v in self.orders.items()},
            positions={k:asdict(v) for k,v in self.positions.items()}, actions={k:asdict(v) for k,v in self.actions.items()},
            deals=self.deals, events=self.events, realized_net_money=self.realized_net_money,
            loss_debit_money=self.loss_debit_money, peak_net_money=self.peak_net_money,
            hedge_cost_committed=self.hedge_cost_committed, hedge_deadline_ms=self.hedge_deadline_ms,
            last_at_ms=self.last_at_ms, state=self.state), allow_nan=False, sort_keys=True)

    @classmethod
    def from_json(cls, payload):
        data = json.loads(payload)
        if data['schema'] != cls.schema:
            raise ValueError('BASKET_JOURNAL_VERSION_INVALID')
        book = cls.__new__(cls)
        book.envelope, book.config = BasketEnvelope(**data['envelope']), BasketConfig(**data['config'])
        book.base_plan = EntryPlan(**data['base_plan']); book.base_side = book.base_plan.side
        book.orders = {k:Reservation(**{**v, 'plan':EntryPlan(**v['plan'])}) for k,v in data['orders'].items()}
        book.positions = {k:BasketPosition(**v) for k,v in data['positions'].items()}
        book.actions = {k:replace(BasketAction(**v), status='UNCERTAIN' if v['status'] != 'RESOLVED' else v['status']) for k,v in data['actions'].items()}
        for name in ('deals', 'events', 'realized_net_money', 'loss_debit_money', 'peak_net_money', 'hedge_cost_committed', 'hedge_deadline_ms', 'last_at_ms'):
            setattr(book, name, data[name])
        if book.base_plan.source != book.envelope.source or any(p.order_id not in book.orders for p in book.positions.values()):
            raise ValueError('BASKET_JOURNAL_LINEAGE_INVALID')
        book._resume_state, book.state = data['state'], 'RECOVERY_REQUIRED'
        return book

    def recover(self, facts, observed_positions, observed_pending_order_ids, now_ms):
        """Exact scoped broker reconciliation after replaying all missing deals."""
        self._clock(now_ms); self._facts(facts, now_ms)
        expected = {p.ticket:p for p in self.positions.values() if p.open_lots > 1e-9}
        if expected.keys() != observed_positions.keys():
            raise ValueError('BASKET_POSITION_RECOVERY_MISMATCH')
        for ticket, position in expected.items():
            actual = observed_positions[ticket]
            positive(actual['stop'], 'OBSERVED_BROKER_STOP_REQUIRED')
            nonnegative(actual['lots'], 'OBSERVED_BROKER_VOLUME_REQUIRED')
            sign = 1 if position.side == 'LONG' else -1
            if abs(position.open_lots-actual['lots']) > 1e-9 or sign*(actual['stop']-position.original_stop) < -1e-9:
                raise ValueError('BASKET_POSITION_RECOVERY_MISMATCH')
        pending = {o.order_id for o in self.orders.values() if o.pending_lots > 1e-9}
        if pending != set(observed_pending_order_ids):
            raise ValueError('BASKET_PENDING_RECOVERY_MISMATCH')
        if self.committed_risk(facts) > self.envelope.risk_allowance_money+1e-9:
            raise ValueError('BASKET_RECOVERY_RISK_EXCEEDED')
        for ticket, actual in observed_positions.items():
            self.positions[ticket] = replace(self.positions[ticket], observed_stop=actual['stop'])
        self.state = 'CLOSING' if self._resume_state == 'CLOSING' else 'CLOSED' if self._resume_state == 'CLOSED' else 'OPEN'
        self._event(now_ms, 'BROKER_RECOVERY_RECONCILED')
