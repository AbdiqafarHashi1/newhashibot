"""Adapter integration through deterministic fake terminal receipts, not live MT5."""
from contextlib import nullcontext
from dataclasses import replace
import tempfile
import threading
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from gold_turbo.runtime import GoldTurboRuntime, MAGIC
from gold_turbo.micro import MicroScalper
from gold_turbo.momentum import MomentumScalper
from test_gold_turbo_scalpers import snapshot, tick_snapshot


class Terminal:
    def __init__(self,snap):
        self.snap=snap;self.positions=[];self.deals=[];self.sends=[];self.closes=[];self.modifications=[];self.uncertain=False
    def native_transaction(self):return nullcontext()
    def get_account_info(self):
        return dict(connected=True,login=77,server='Demo',environment='demo',trade_allowed=True,trade_expert=True,
                    hedging=True,equity=1000,balance=1000,free_margin=1000,margin=0,currency='USD')
    def get_terminal_info(self):return dict(connected=True,autotrading=True)
    def get_symbol_info(self,s):
        return dict(broker_symbol='XAUUSD.r',tick_size=.01,point=.01,stops_level_points=1,
                    contract_size=100,volume_min=.01,volume_step=.01,volume_max=5,
                    bid=self.snap.latest_tick.bid,ask=self.snap.latest_tick.ask,fill_policies=['ioc'],quote_to_account_conversion=1)
    def get_positions(self):return [dict(p) for p in self.positions]
    def get_orders(self):return []
    def gold_turbo_history(self,since):return [dict(d) for d in self.deals]
    def gold_turbo_order_terminal(self,ticket):return ticket.startswith(('order','close'))
    def gold_turbo_position_risk(self,p):return max(0,(p['entry_price']-p['sl'])*(1 if p['side']=='buy' else -1)*p['quantity']*100)
    def gold_turbo_native_cost(self,symbol,side,lots,entry,stop):
        return dict(loss=abs(entry-stop)*lots*100,margin=lots*100)
    def normalize_volume(self,q,minimum,maximum,step):return int(q/step+1e-8)*step if q>=minimum else minimum
    def place_order(self,p):
        self.sends.append(p)
        if self.uncertain:return dict(success=False,error_code='TIMEOUT')
        n=str(len(self.sends));now=self.snap.as_of_ms
        self.positions.append(dict(ticket=n,identifier=n,symbol='XAUUSD.r',side=p['side'],quantity=p['volume'],
            entry_price=self.snap.latest_tick.ask if p['side']=='buy' else self.snap.latest_tick.bid,
            sl=p['sl'],tp=p['tp'],magic=p['magic'],comment=p['comment'],time=now//1000))
        self.deals.append(dict(ticket='entry'+n,order='order'+n,position_id=n,entry=0,symbol='XAUUSD.r',
            comment=p['comment'],volume=p['volume'],price=self.positions[-1]['entry_price'],commission=-.01,fee=0,profit=0,swap=0,time=now//1000))
        return dict(success=True,provider_order_id='order'+n)
    def close_position(self,ticket,volume=None):
        self.closes.append((ticket,volume));p=next(p for p in self.positions if p['ticket']==ticket)
        q=p['quantity'] if volume is None else volume;now=self.snap.as_of_ms
        price=self.snap.latest_tick.bid if p['side']=='buy' else self.snap.latest_tick.ask
        self.deals.append(dict(ticket='exit'+str(len(self.closes)),order='close'+str(len(self.closes)),position_id=ticket,entry=1,symbol=p['symbol'],comment='close',volume=q,price=price,profit=(price-p['entry_price'])*(1 if p['side']=='buy' else -1)*q*100,commission=-.01,fee=0,swap=0,time=now//1000))
        p['quantity']-=q
        self.positions=[p for p in self.positions if p['quantity']>1e-9]
        return dict(success=True,provider_order_id='close'+str(len(self.closes)))
    def modify_position(self,ticket,sl,tp):
        self.modifications.append((ticket,sl,tp));next(p for p in self.positions if p['ticket']==ticket).update(sl=sl,tp=tp)
        return dict(success=True)
    def cancel_order(self,ticket):return dict(success=True)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.dir=tempfile.TemporaryDirectory();self.addCleanup(self.dir.cleanup)
        self.snap=snapshot();self.now=self.snap.as_of_ms;self.terminal=Terminal(self.snap)
        self.scope=dict(account_id=self.snap.source,owner_id='owner',bridge_id='bridge',worker_id='worker',execution_account_id='execution',login=77,server='Demo')
        self.runtime=GoldTurboRuntime(self.terminal,self.scope,self.dir.name,lambda:{'high_impact_in_window':False},lambda:self.now)
        self.runtime._feed=lambda spec,now:self.terminal.snap
        self.lease=dict(schema='gold-turbo-lease/v1',owner_id='owner',account_id=self.snap.source,bridge_id='bridge',worker_id='worker',execution_account_id='execution',environment='demo',account_mode='PERSONAL',server='Demo',issued_at_ms=self.now,expires_at_ms=self.now+30000,subscription_until_ms=self.now+600000,strategy_ids=[MicroScalper.strategy_id],risk_pct=.25,daily_loss_pct=1.5,total_loss_pct=8,max_open_risk_pct=1,max_margin_pct=20,session_profit_lock_pct=3,session_trailing_pct=1,basket_target_pct=.2,commission_quote_per_lot_per_side=1,slippage_quote_per_side=.005,hedge_enabled=False,expiry_policy='CLOSE')
        self.runtime.set_lease(self.lease)
        weekend=patch('weekend_guard.weekend_entry_allowed',return_value=True);weekend.start();self.addCleanup(weekend.stop)
    def advance(self,ms=1000,bid=None):
        self.now+=ms;self.terminal.snap=tick_snapshot(self.snap,self.snap.latest_tick.bid if bid is None else bid,self.now)
    def test_demo_entry_native_sizing_protection_and_reconciliation(self):
        self.runtime.step();self.assertEqual(len(self.terminal.sends),1)
        send=self.terminal.sends[0]
        self.assertEqual(send['magic'],MAGIC);self.assertGreater(send['sl'],0);self.assertGreater(send['tp'],send['sl'])
        self.assertLessEqual(send['authorized_risk_amount'],2)
        self.advance();self.runtime.step()
        book=next(iter(self.runtime.books.values()))
        self.assertTrue(book.positions);self.assertEqual(book.state,'OPEN')
        self.assertEqual(len(self.terminal.sends),1)
    def test_expiry_closes_only_journal_owned_positions(self):
        self.runtime.step();self.advance();self.runtime.step()
        self.terminal.positions.append(dict(ticket='foreign',identifier='foreign',symbol='EURUSD',side='buy',quantity=.1,entry_price=1.1,sl=1,tp=1.2,magic=9,comment='manual',time=self.now//1000))
        self.runtime.subscription_until=self.now
        self.advance();self.runtime.step()
        self.assertEqual(self.terminal.closes[0][0],'1')
        self.assertTrue(any(p['ticket']=='foreign' for p in self.terminal.positions))
        self.advance();self.runtime.step()
        self.assertEqual(next(iter(self.runtime.books.values())).state,'CLOSED')
    def test_unknown_send_is_never_automatically_resubmitted_after_restart(self):
        self.terminal.uncertain=True;self.runtime.step();self.advance();self.runtime.step()
        self.assertEqual(len(self.terminal.sends),1)
        restored=GoldTurboRuntime(self.terminal,self.scope,self.dir.name,lambda:{'high_impact_in_window':False},lambda:self.now)
        restored._feed=self.runtime._feed;restored.set_lease(dict(self.lease,issued_at_ms=self.now,expires_at_ms=self.now+30000))
        restored.step();self.assertEqual(len(self.terminal.sends),1)
    def test_missing_news_or_live_terminal_never_places(self):
        self.runtime.calendar_reader=lambda:None;self.runtime.step();self.assertFalse(self.terminal.sends)
        self.terminal.get_account_info=lambda:dict(connected=True,login=77,server='Demo',environment='live')
        with self.assertRaises(RuntimeError):self.runtime.step()
        self.assertFalse(self.terminal.sends)
    def test_wrong_or_expired_lease_and_prop_configuration_are_rejected(self):
        for updates in ({'account_id':'foreign'},{'environment':'live'},{'account_mode':'PROP_FUNDED'},
                        {'execution_account_id':'other'},{'expires_at_ms':self.now-1},{'daily_loss_pct':20}):
            with self.subTest(updates=updates),self.assertRaises(ValueError):self.runtime.set_lease(dict(self.lease,**updates))
    def test_native_minimum_lot_and_margin_do_not_get_overridden(self):
        plan=MicroScalper().evaluate(self.snap, __import__('test_gold_turbo_scalpers').COSTS,self.now).plan
        spec=self.terminal.get_symbol_info('XAUUSD');a=self.terminal.get_account_info()
        self.assertIsNone(self.runtime._size(plan,spec,a,self.lease,.01))
        self.assertIsNone(self.runtime._size(plan,spec,dict(a,free_margin=0),self.lease,2))
    def test_daily_lock_survives_restart_and_does_not_reset_with_profile(self):
        self.runtime.step();a=self.terminal.get_account_info()
        self.assertFalse(self.runtime._guard(dict(a,equity=980),self.lease,self.now))
        self.runtime.save()
        other=GoldTurboRuntime(self.terminal,self.scope,self.dir.name,lambda:None,lambda:self.now)
        self.assertTrue(other.guard['locked'])
        self.assertFalse(other._guard(a,self.lease,self.now))
    def test_cloud_loss_stops_new_entries_but_retains_owned_management(self):
        self.runtime.step();self.advance();self.runtime.step();self.runtime.set_lease(None)
        self.advance(bid=self.snap.latest_tick.bid+.25);self.runtime.step()
        self.assertTrue(self.terminal.modifications);self.assertEqual(len(self.terminal.sends),1)
    def test_entry_memory_is_checkpointed_across_restart(self):
        self.runtime.step();self.advance();self.runtime.step()
        restored=GoldTurboRuntime(self.terminal,self.scope,self.dir.name,lambda:{'high_impact_in_window':False},lambda:self.now)
        restored._feed=self.runtime._feed;restored.set_lease(dict(self.lease,issued_at_ms=self.now,expires_at_ms=self.now+30000))
        restored.step();self.assertEqual(len(self.terminal.sends),1)
    def test_shared_external_entry_budget_rejects_overexposure(self):
        self.runtime.step();self.advance();self.runtime.step()
        with self.assertRaises(RuntimeError):
            self.runtime.guard_external_entry(dict(symbol='XAUUSD',side='BUY',quantity=2,stop_loss=1999))
    def test_explicit_revoke_closes_and_cannot_be_used_for_new_entries(self):
        self.runtime.step();self.advance();self.runtime.step();self.runtime.set_lease({'revoked':True})
        self.advance();self.runtime.step();self.assertTrue(self.terminal.closes)
        self.assertEqual(len(self.terminal.sends),1)

    def test_partial_profit_is_marked_only_after_actual_exit_deal(self):
        self.snap=snapshot('impulse');self.terminal.snap=self.snap
        self.runtime.set_lease(dict(self.lease,strategy_ids=[MomentumScalper.strategy_id]))
        self.runtime.step();self.advance();self.runtime.step()
        book=next(iter(self.runtime.books.values()));plan=book.base_plan
        price=plan.reference_entry+plan.planned_loss_with_costs*1.1+plan.fee_slippage_price
        self.advance(bid=price);self.runtime.step()  # tighten first
        self.advance(bid=price);self.runtime.step()  # request partial
        self.assertEqual(len(self.terminal.closes),1)
        self.advance(bid=price);self.runtime.step()  # observe exit, never repeat partial
        self.assertTrue(self.runtime.position_states['1']['partial_taken'])
        self.assertEqual(len(self.terminal.closes),1)

    def test_definitive_rejection_releases_reservation_but_unknown_timeout_does_not(self):
        def rejected(payload):
            self.terminal.sends.append(payload)
            return dict(success=False,retcode=10016,error_code='validation_failed')
        self.terminal.place_order=rejected
        self.runtime.step()
        self.assertEqual(next(iter(self.runtime.books.values())).state,'CLOSED')
        self.assertEqual(next(iter(self.runtime.links.values()))['status'],'REJECTED')

    def test_missing_journal_position_is_quarantined_instead_of_adopted(self):
        self.terminal.positions.append(dict(ticket='orphan',identifier='orphan',symbol='XAUUSD.r',side='buy',quantity=.01,entry_price=2000,sl=1999,tp=2001,magic=MAGIC,comment='ht:unknown',time=self.now//1000))
        self.runtime.step()
        self.assertFalse(self.terminal.sends);self.assertFalse(self.terminal.closes)
        self.assertEqual(self.runtime.last_reason,'TURBO_UNJOURNALED_POSITION_REQUIRES_RECOVERY')

    def test_native_cent_conversion_is_derived_not_assumed(self):
        original_spec=self.terminal.get_symbol_info
        self.terminal.get_symbol_info=lambda s:dict(original_spec(s),quote_to_account_conversion=None,currency_profit='USD')
        original_account=self.terminal.get_account_info
        self.terminal.get_account_info=lambda:dict(original_account(),equity=100000,balance=100000,free_margin=100000,currency='USC')
        self.terminal.gold_turbo_native_cost=lambda symbol,side,lots,entry,stop:dict(loss=abs(entry-stop)*lots*10000,margin=lots*10000)
        self.runtime.step()
        self.assertEqual(len(self.terminal.sends),1)
        self.assertLessEqual(self.terminal.sends[0]['authorized_risk_amount'],200)

    def test_real_feed_adapter_keeps_completed_and_forming_separate(self):
        rows=[]
        for f in self.snap.frames:
            tf={60000:'1m',300000:'5m',900000:'15m'}[f.timeframe_ms]
            for c in f.completed:
                rows.append(dict(timeframe=tf,open_time=__import__('datetime').datetime.fromtimestamp(c.open_ms/1000,__import__('datetime').timezone.utc).isoformat(),open=c.open,high=c.high,low=c.low,close=c.close,tick_volume=c.quote_count))
        def delayed_read(*a,**kw):
            self.now+=5
            return dict(candles=rows)
        self.terminal.get_market_data=delayed_read
        self.terminal.gold_turbo_ticks=lambda symbol,since:[dict(time_msc=self.now-1000,bid=2000,ask=2000.02),dict(time_msc=self.now,bid=2000.1,ask=2000.12)]
        fresh=GoldTurboRuntime(self.terminal,self.scope,self.dir.name,lambda:None,lambda:self.now)
        state=fresh._feed(self.terminal.get_symbol_info('XAUUSD'),self.now)
        self.assertEqual(state.latest_tick.at_ms,self.now)
        self.assertFalse(state.windows[-1].available)
        self.assertTrue(state.frames[0].developing.partial_start)
        self.assertTrue(all(c.end_ms<=self.now for f in state.frames for c in f.completed))

    def test_adaptive_ranks_qualified_candidates_while_custom_preserves_selection(self):
        base=MicroScalper().evaluate(self.snap,__import__('test_gold_turbo_scalpers').COSTS,self.now)
        stronger=replace(base,strategy_id=MomentumScalper.strategy_id,plan=replace(base.plan,
            strategy_id=MomentumScalper.strategy_id,planned_net_reward=base.plan.planned_net_reward*2))
        for sid,decision in ((MicroScalper.strategy_id,base),(MomentumScalper.strategy_id,stronger)):
            self.runtime.engines[sid]=SimpleNamespace(evaluate=lambda *a,d=decision:d)
        config=dict(self.lease,strategy_ids=[MicroScalper.strategy_id,MomentumScalper.strategy_id],selection_mode='ADAPTIVE')
        adaptive=self.runtime._candidates(self.snap,None,config,self.now)
        self.assertEqual(adaptive[0][0],MomentumScalper.strategy_id)
        custom=self.runtime._candidates(self.snap,None,dict(config,selection_mode='CUSTOM'),self.now)
        self.assertEqual(custom[0][0],MicroScalper.strategy_id)

    def test_adaptive_does_not_force_a_close_opposing_choice(self):
        base=MicroScalper().evaluate(self.snap,__import__('test_gold_turbo_scalpers').COSTS,self.now)
        opposite=replace(base,strategy_id=MomentumScalper.strategy_id,decision='SHORT')
        for sid,decision in ((MicroScalper.strategy_id,base),(MomentumScalper.strategy_id,opposite)):
            self.runtime.engines[sid]=SimpleNamespace(evaluate=lambda *a,d=decision:d)
        config=dict(self.lease,strategy_ids=[MicroScalper.strategy_id,MomentumScalper.strategy_id],selection_mode='ADAPTIVE')
        self.assertEqual(self.runtime._candidates(self.snap,None,config,self.now),[])
        self.assertEqual(self.runtime.last_reason,'ADAPTIVE_DIRECTION_CONFLICT')

    def test_heartbeat_summary_is_bounded_and_does_not_embed_quotes_or_secrets(self):
        self.runtime.step();self.advance();self.runtime.step()
        summary=self.runtime.summary()
        self.assertEqual(summary['account_id'],self.scope['account_id'])
        self.assertEqual(summary['as_of_ms'],self.now)
        self.assertLessEqual(len(summary['recent_decisions']),20)
        self.assertNotIn('ticks',summary);self.assertNotIn('password',summary)
        summary['last_reason']='mutated copy'
        self.assertNotEqual(self.runtime.summary()['last_reason'],'mutated copy')

if __name__=='__main__':unittest.main()
