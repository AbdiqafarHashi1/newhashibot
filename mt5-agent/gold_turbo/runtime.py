"""Existing-agent demo execution adapter. No ticks leave this local runtime."""
from dataclasses import asdict, replace
from datetime import datetime, timezone
from decimal import Decimal, ROUND_FLOOR
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import time
from . import (MarketIntelligence, IntelligenceConfig, Tick, Candle, ExecutionCosts,
               MicroScalper, MomentumScalper, RangeScalper, TrendScalper, BasketScalper)
from .basket import BasketBook, BasketConfig, BasketEnvelope, BrokerFacts
from .strategy_contracts import EntryPlan
from .management import PositionObservation, manage_position

FACTORIES={c.strategy_id:c for c in (MicroScalper,MomentumScalper,RangeScalper,TrendScalper,BasketScalper)}
MAGIC=886006


class GoldTurboRuntime:
    def __init__(self, client, scope, directory, calendar_reader, clock=None):
        self.client,self.scope,self.calendar_reader=client,dict(scope),calendar_reader
        self.clock=clock or (lambda:int(time.time()*1000))
        key=hashlib.sha256(json.dumps(self.scope,sort_keys=True).encode()).hexdigest()[:24]
        self.path=Path(directory)/('gold-turbo-'+key+'.json')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.lease=None;self.revoked=False;self.subscription_until=0
        self.intelligence=None;self.engines={};self.tick_cursor=None;self.last_refresh=0
        self.books={};self.links={};self.position_states={};self.action_receipts={};self.seen_opportunities=set()
        self._last_saved=None;self._history={};self._history_at=0;self._history_since=0
        self.guard={};self._restored_engine_states={};self.last_reason='DISABLED';self.shock_until=0;self._stop=threading.Event()
        if self.path.exists():
            saved=json.loads(self.path.read_text())
            if saved['scope']!=self.scope:raise RuntimeError('TURBO_JOURNAL_SCOPE_MISMATCH')
            self.books={k:BasketBook.from_json(v) for k,v in saved['books'].items()}
            self.links=saved['links'];self.position_states=saved['position_states'];self.guard=saved['guard'];self.action_receipts=saved.get('action_receipts',{})
            self.seen_opportunities=set(saved['seen_opportunities']);self.subscription_until=saved['subscription_until'];self._restored_engine_states=saved.get('engine_states',{})
        self._thread=None

    @staticmethod
    def _engine_state(engine):
        value={'memory':dict(engine.memory.__dict__)}
        for name in ('_admitted_reaction','_admitted_pullback'):
            if hasattr(engine,name):value[name]=getattr(engine,name)
        if hasattr(engine,'direct_memory'):value['direct_memory']=dict(engine.direct_memory.__dict__)
        if hasattr(engine,'engines'):value['engines']=[GoldTurboRuntime._engine_state(e) for e in engine.engines]
        return value

    @staticmethod
    def _restore_engine(engine,value):
        def freeze(x):return tuple(freeze(v) for v in x) if isinstance(x,list) else x
        for name,field in value.get('memory',{}).items():setattr(engine.memory,name,freeze(field))
        for name in ('_admitted_reaction','_admitted_pullback'):
            if name in value:setattr(engine,name,freeze(value[name]))
        if 'direct_memory' in value:
            for name,field in value['direct_memory'].items():setattr(engine.direct_memory,name,freeze(field))
        if 'engines' in value:
            for child,state in zip(engine.engines,value['engines']):GoldTurboRuntime._restore_engine(child,state)

    def save(self):
        for bid,book in self.books.items():
            if book.events:
                audit_fd=os.open(self.path.with_suffix('.events.jsonl'),os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
                with os.fdopen(audit_fd,'a',encoding='utf8') as audit:
                    for event in book.events:
                        payload=dict(basket_id=bid,**event)
                        payload['event_id']=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
                        audit.write(json.dumps(payload,allow_nan=False)+'\n')
                    audit.flush();os.fsync(audit.fileno())
                book.events.clear()
        value=dict(engine_states={**self._restored_engine_states,**{sid:self._engine_state(e) for sid,e in self.engines.items()}},action_receipts=self.action_receipts,scope=self.scope,books={k:b.to_json() for k,b in self.books.items()},links=self.links,
                   position_states=self.position_states,guard=self.guard,seen_opportunities=sorted(self.seen_opportunities),
                   subscription_until=self.subscription_until,last_reason=self.last_reason)
        serialized=json.dumps(value,allow_nan=False,sort_keys=True)
        if serialized==self._last_saved:return
        tmp=self.path.with_suffix('.pending')
        fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'w') as f:
            f.write(serialized);f.flush();os.fsync(f.fileno())
        os.replace(tmp,self.path)
        if os.name!='nt':
            directory=os.open(self.path.parent,os.O_RDONLY)
            try:os.fsync(directory)
            finally:os.close(directory)
        self._last_saved=serialized

    def set_lease(self, value):
        # Called from the independent cloud-refresh thread. Copy atomically;
        # protection and all native trading stay on the local runtime thread.
        if value is None:self.lease=None;return
        if value.get('revoked') is True:self.revoked=True;self.lease=None;return
        now=self.clock()
        expected={'schema':'gold-turbo-lease/v1','owner_id':self.scope['owner_id'],
                  'account_id':self.scope['account_id'],'bridge_id':self.scope['bridge_id'],
                  'worker_id':self.scope['worker_id'],'execution_account_id':self.scope['execution_account_id'],'environment':'demo','account_mode':'PERSONAL','server':self.scope['server']}
        if any(value.get(k)!=v for k,v in expected.items()):raise ValueError('TURBO_LEASE_SCOPE_MISMATCH')
        if not value['issued_at_ms']<=now<value['expires_at_ms']<=min(now+30000,value['subscription_until_ms']):raise ValueError('TURBO_LEASE_EXPIRED')
        bounds={'risk_pct':(.01,.5),'daily_loss_pct':(1,2),'total_loss_pct':(1,10),
                'max_open_risk_pct':(.01,2),'max_margin_pct':(1,30),'basket_target_pct':(.05,1),
                'session_profit_lock_pct':(.1,20),'session_trailing_pct':(.1,5)}
        for key,(low,high) in bounds.items():
            v=value.get(key)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not low<=v<=high:raise ValueError('TURBO_LEASE_LIMIT_INVALID')
        for key in ('commission_quote_per_lot_per_side','slippage_quote_per_side'):
            v=value.get(key)
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0:raise ValueError('TURBO_COST_CONFIG_REQUIRED')
        if not value.get('strategy_ids') or any(s not in FACTORIES for s in value['strategy_ids']) or value.get('hedge_enabled') is not False or value.get('expiry_policy')!='CLOSE':raise ValueError('TURBO_CONFIGURATION_UNSUPPORTED')
        self.subscription_until=value['subscription_until_ms'];self.revoked=False
        self.lease=json.loads(json.dumps(value))

    def _identity(self):
        a=self.client.get_account_info();t=self.client.get_terminal_info()
        if not (a.get('connected') is True and a.get('login')==self.scope['login'] and a.get('server')==self.scope['server'] and a.get('environment')=='demo' and a.get('trade_allowed') is True and a.get('trade_expert') is True and t.get('connected') is True and t.get('autotrading') is True):raise RuntimeError('TURBO_VERIFIED_DEMO_TERMINAL_REQUIRED')
        if a.get('hedging') is not True:raise RuntimeError('TURBO_NETTING_ADAPTER_NOT_QUALIFIED')
        return a

    def _feed(self,spec,now):
        if self.intelligence is None:
            self.intelligence=MarketIntelligence('XAUUSD',self.scope['account_id'],IntelligenceConfig(price_tick=spec['tick_size']))
        if now-self.last_refresh>=5000:
            market=self.client.get_market_data('XAUUSD',spec['broker_symbol'],['1m','5m','15m'],bars=64)
            rows=[]
            for r in market['candles']:
                tf={'1m':60000,'5m':300000,'15m':900000}[r['timeframe']]
                at=int(datetime.fromisoformat(r['open_time'].replace('Z','+00:00')).timestamp()*1000)
                if at+tf<=now:rows.append(Candle('XAUUSD',self.scope['account_id'],tf,at,r['open'],r['high'],r['low'],r['close'],int(r.get('tick_volume',r.get('volume',0))),'BROKER_COMPLETED_BAR'))
            self.intelligence.refresh_completed(rows,now);self.last_refresh=now
        start=self.tick_cursor if self.tick_cursor is not None else now-30000
        rows=self.client.gold_turbo_ticks(spec['broker_symbol'],start)
        for row in rows:
            at=int(row['time_msc'])
            # Old batch history warms microstructure without pretending it was
            # seen live. Entry decisions use only the latest fresh snapshot.
            tick=Tick('XAUUSD',self.scope['account_id'],at,row['bid'],row['ask'])
            if self.intelligence._last_tick is None and at<self.intelligence._seed_end_ms:continue
            observed=self.clock()
            if at>observed or observed-at>2000:continue
            self.intelligence.ingest(tick,observed)
            self.tick_cursor=max(self.tick_cursor or at,at)
        return self.intelligence.snapshot(self.clock())

    def _guard(self,a,lease,now):
        day=datetime.fromtimestamp(now/1000,timezone.utc).date().isoformat();eq=a['equity']
        if 'day' not in self.guard:self.guard=dict(day=day,day_equity=eq,initial_equity=eq,peak_equity=eq,day_peak=eq,locked=False,total_locked=False)
        g=self.guard
        if g['day']!=day:g.update(day=day,day_equity=eq,day_peak=eq,locked=False)
        g['peak_equity']=max(g['peak_equity'],eq);g['day_peak']=max(g['day_peak'],eq)
        daily=100*(g['day_equity']-eq)/g['day_equity'];total=100*(g['peak_equity']-eq)/g['peak_equity']
        if daily>=lease['daily_loss_pct']:g['locked']=True
        if total>=lease['total_loss_pct']:g['total_locked']=True
        if 100*(eq-g['day_equity'])/g['day_equity']>=lease['session_profit_lock_pct']:g['locked']=True
        if g['day_peak']>=g['day_equity']*(1+lease['session_trailing_pct']/100) and 100*(g['day_peak']-eq)/g['day_peak']>=lease['session_trailing_pct']:g['locked']=True
        return not(g['locked'] or g['total_locked'])

    def _facts(self,a,spec,lease,now,news_clear):
        conversion=spec.get('quote_to_account_conversion')
        if not conversion or conversion<=0:raise RuntimeError('TURBO_QUOTE_CONVERSION_UNAVAILABLE')
        native=self.client.gold_turbo_native_cost(spec['broker_symbol'],'LONG',spec['volume_min'],spec['ask'],spec['bid']-max(spec['tick_size'],spec['ask']-spec['bid']))
        return BrokerFacts(self.scope['account_id'],now,a['equity'],a['free_margin'],spec['contract_size'],conversion,
            native['margin']/spec['volume_min'],spec['volume_min'],spec['volume_step'],spec['volume_max'],'HEDGING',
            news_clear=news_clear,account_risk_permitted=not(self.guard.get('locked') or self.guard.get('total_locked')))

    def _reconcile(self,book,facts,positions,history,now):
        for oid,order in list(book.orders.items()):
            link=self.links[oid];comment=link['comment']
            entries=[d for d in history if d['entry']==0 and d['comment']==comment and d['symbol']==link['symbol']]
            for d in entries:
                pid=str(d['position_id']);p=next((p for p in positions if str(p.get('identifier',p['ticket']))==pid),None)
                book.entry_fill(oid,str(d['ticket']),pid,float(d['volume']),float(d['price']),max(0,-float(d['commission'])-float(d.get('fee',0))),facts,now,
                    bool(p and p.get('sl') and p.get('tp') and (float(p['sl'])>=order.plan.stop-1e-8 if order.plan.side=='LONG' else float(p['sl'])<=order.plan.stop+1e-8)))
                link['provider_order_id']=str(d['order']);link['status']='OBSERVED'
            provider_order=link.get('provider_order_id')
            if order.pending_lots>0 and provider_order and self.client.gold_turbo_order_terminal(provider_order):book.cancel_confirmed(oid,now)
        for pid,p in list(book.positions.items()):
            for d in history:
                if str(d.get('position_id'))==pid and d['entry'] in (1,3):
                    book.exit_fill(pid,str(d['ticket']),float(d['volume']),float(d['price']),float(d['profit']),max(0,-float(d['commission'])-float(d.get('fee',0))),float(d['swap']),now)
            native=next((n for n in positions if str(n.get('identifier',n['ticket']))==pid),None)
            if book.positions[pid].open_lots < book.orders[p.order_id].filled_lots-1e-9 and pid in self.position_states:
                self.position_states[pid]['partial_taken']=True
            if native is not None:
                if not native.get('sl') or not native.get('tp'):book.state='RECOVERY_REQUIRED'
                book.mark_carry(pid,float(native.get('swap',0)),now)
        if book.state=='RECOVERY_REQUIRED':
            actual={str(n.get('identifier',n['ticket'])):{'lots':n['quantity'],'stop':n.get('sl') or 0} for n in positions if str(n.get('identifier',n['ticket'])) in book.positions}
            pending=[oid for oid,o in book.orders.items() if o.pending_lots>0]
            # Unknown submissions with no provider order identity cannot be
            # certified absent merely because an instantaneous snapshot is flat.
            if any(self.links[oid]['status'] in ('SENDING','UNCERTAIN') for oid in pending):return
            book.recover(facts,actual,pending,now)
        for key,action in list(book.actions.items()):
            if action.kind=='CLOSE_POSITION' and action.status in ('SENT','UNCERTAIN','REJECTED'):
                receipt=self.action_receipts.get(key,{})
                final=receipt.get('provider_order_id') and self.client.gold_turbo_order_terminal(receipt['provider_order_id'])
                if not final and not (receipt.get('success') is False and receipt.get('retcode') in (10004,10006,10013,10014,10015,10016,10018,10019)):
                    continue
                native=next((n for n in positions if str(n.get('identifier',n['ticket']))==action.target_id),None)
                book.reconcile_close(key,native['quantity'] if native else 0,now,now)

    def _dispatch(self,book,positions,now):
        for action in book.ready_actions():
            if action.kind=='CANCEL_ORDER':
                link=self.links[action.target_id]
                if link.get('provider_order_id') is None:continue
                book.action_status(action.request_id,'SENT',now);self.save()
                result=self.client.cancel_order(link['provider_order_id'])
                self.action_receipts[action.request_id]=result
            else:
                native=next((p for p in positions if str(p.get('identifier',p['ticket']))==action.target_id),None)
                if native is None:continue
                link=self.links[book.positions[action.target_id].order_id]
                if native.get('magic')!=MAGIC or native.get('comment')!=link['comment']:raise RuntimeError('TURBO_POSITION_OWNERSHIP_MISMATCH')
                book.action_status(action.request_id,'SENT',now);self.save()
                result=self.client.close_position(str(native['ticket']),None if action.lots>=native['quantity']-1e-9 else action.lots)
                self.action_receipts[action.request_id]=result
            self._history_at=0
            self.save()

    def _size(self,plan,spec,a,lease,budget):
        if not any(p in spec['fill_policies'] for p in ('ioc','fok')):return None
        minimum=spec['volume_min'];conversion=spec['quote_to_account_conversion']
        entry=spec['ask'] if plan.side=='LONG' else spec['bid']
        if abs(entry-plan.reference_entry)>lease['slippage_quote_per_side']+1e-8:return None
        required=spec['stops_level_points']*spec['point']
        sign=1 if plan.side=='LONG' else -1
        if sign*(entry-plan.stop)<required or sign*(plan.target-entry)<required:return None
        small=self.client.gold_turbo_native_cost(spec['broker_symbol'],plan.side,minimum,entry,plan.stop)
        friction=plan.fee_slippage_price*spec['contract_size']*conversion
        unit=small['loss']/minimum+friction
        raw=min(budget/unit,spec['volume_max'])
        if raw<minimum:return None
        step=Decimal(str(spec['volume_step']));lots=float((Decimal(str(raw))/step).to_integral_value(rounding=ROUND_FLOOR)*step)
        calc=self.client.gold_turbo_native_cost(spec['broker_symbol'],plan.side,lots,entry,plan.stop)
        if calc['loss']+lots*friction>budget+1e-8 or calc['margin']>min(a['free_margin'],a['equity']*lease['max_margin_pct']/100):return None
        return lots,calc['loss']+lots*friction

    def guard_external_entry(self,payload):
        lease=self.lease
        if not lease or self.clock()>=lease['expires_at_ms'] or self.guard.get('locked') or self.guard.get('total_locked'):
            raise RuntimeError('TURBO_SHARED_ACCOUNT_ENTRY_LOCK')
        a=self._identity()
        positions=self.client.get_positions()+self.client.get_orders()
        risk=sum(self.client.gold_turbo_position_risk(p) for p in positions)
        pending=sum(sum(o.pending_lots*o.unit_risk_money for o in b.orders.values()) for b in self.books.values())
        symbol=payload['symbol'];spec=self.client.get_symbol_info(symbol)
        side='LONG' if str(payload['side']).upper() in ('BUY','LONG') else 'SHORT'
        entry=spec['ask'] if side=='LONG' else spec['bid']
        quantity=float(payload.get('quantity',payload.get('volume',0)))
        proposed=self.client.gold_turbo_native_cost(spec['broker_symbol'],side,quantity,entry,float(payload.get('stop_loss',payload.get('sl',0))))
        if risk+pending+proposed['loss']>a['equity']*lease['max_open_risk_pct']/100 or proposed['margin']>a['free_margin']:
            raise RuntimeError('TURBO_SHARED_ACCOUNT_RISK_EXCEEDED')

    def step(self):
        if self.lease is None and not self.books:return
        with self.client.native_transaction():
            return self._step()

    def _step(self):
        now=self.clock();a=self._identity();lease=self.lease
        spec=self.client.get_symbol_info('XAUUSD')
        if not spec:raise RuntimeError('TURBO_SYMBOL_UNAVAILABLE')
        positions=self.client.get_positions();orders=self.client.get_orders()
        if not spec.get('quote_to_account_conversion'):
            if spec.get('currency_profit')!='USD':raise RuntimeError('TURBO_NATIVE_QUOTE_CONVERSION_REQUIRED')
            rates=[]
            for side,entry,stop in (('LONG',spec['ask'],spec['ask']-spec['tick_size']),('SHORT',spec['bid'],spec['bid']+spec['tick_size'])):
                cost=self.client.gold_turbo_native_cost(spec['broker_symbol'],side,spec['volume_min'],entry,stop)
                rates.append(cost['loss']/(abs(entry-stop)*spec['volume_min']*spec['contract_size']))
            spec={**spec,'quote_to_account_conversion':max(rates)}
        known_comments={link['comment'] for link in self.links.values()}
        orphaned=any(p.get('magic')==MAGIC and p.get('comment') not in known_comments for p in positions)
        if now-self._history_at>=1000:
            since=self._history_since or min([b.envelope.created_at_ms for b in self.books.values() if b.state!='CLOSED']+[now-60000])
            rows=self.client.gold_turbo_history(max(0,since-5000))
            if not isinstance(rows,list):raise RuntimeError('TURBO_COMPLETE_HISTORY_REQUIRED')
            for row in rows:self._history[str(row['ticket'])]=row
            self._history_since=max([int(d['time']*1000) for d in rows]+[since]);self._history_at=now
        history=list(self._history.values())
        snap=self._feed(spec,now)
        now=self.clock()
        limits=lease or self.guard.get('limits')
        if limits is None:return
        allowed=self._guard(a,limits,now)
        self.guard['limits']=limits
        calendar=self.calendar_reader();news_clear=bool(calendar and calendar.get('high_impact_in_window') is False)
        facts=self._facts(a,spec,limits,now,news_clear)
        if snap.volatility_shock:self.shock_until=max(self.shock_until,now+60000)
        for book in self.books.values():
            if book.state=='CLOSED':continue
            try:self._reconcile(book,facts,positions,history,now)
            except (ValueError,RuntimeError):book.close_all('PROVIDER_RECONCILIATION_REQUIRED',now)
            if self.revoked or now>=self.subscription_until or not allowed:book.close_all('ACCESS_OR_ACCOUNT_LOCK',now)
            mark=book.evaluate(snap,facts,now)
            for pid,p in list(book.positions.items()):
                if p.open_lots<=0 or book.state!='OPEN':continue
                native=next((n for n in positions if str(n.get('identifier',n['ticket']))==pid),None)
                if native is None:continue
                plan=book.orders[p.order_id].plan
                state=PositionObservation(plan.opportunity_id,int(native['time']*1000),p.entry_price,p.side,float(native['sl']),**self.position_states.get(pid,{}))
                decision=manage_position(plan,state,snap,now)
                self.position_states[pid]={'best_net_move':decision.state.best_net_move,'partial_taken':state.partial_taken,'last_observed_at_ms':now}
                if decision.action=='CLOSE':book._action('CLOSE_POSITION',pid,p.open_lots,decision.reason)
                elif decision.action=='TIGHTEN_STOP':
                    self.save();self.client.modify_position(str(native['ticket']),decision.next_stop,native['tp'])
                elif decision.action=='PARTIAL_CLOSE':
                    qty=self.client.normalize_volume(p.open_lots*decision.close_fraction,spec['volume_min'],spec['volume_max'],spec['volume_step'])
                    if qty<p.open_lots and qty>=spec['volume_min'] and p.open_lots-qty>=spec['volume_min']-1e-9:
                        book._action('CLOSE_POSITION',pid,qty,'PARTIAL_PROFIT_CAPTURE')
            self._dispatch(book,positions,now)
        self.save()
        if orphaned:self.last_reason='TURBO_UNJOURNALED_POSITION_REQUIRES_RECOVERY'
        if orphaned or not lease or now>=lease['expires_at_ms'] or not allowed or not news_clear or now<self.shock_until:return
        from weekend_guard import weekend_entry_allowed
        if not weekend_entry_allowed('XAUUSD',True,datetime.fromtimestamp(now/1000,timezone.utc)):return
        # Broker-visible risk includes unrelated positions; no stop evidence means
        # no new Turbo entries. Existing owned protection has already run above.
        risk=sum(self.client.gold_turbo_position_risk(p) for p in positions+orders)
        pending=sum(sum(o.pending_lots*o.unit_risk_money for o in b.orders.values()) for b in self.books.values())
        available=a['equity']*lease['max_open_risk_pct']/100-risk-pending
        if available<=0 or any(link['status'] in ('SENDING','UNCERTAIN') for link in self.links.values()):return
        for sid in lease['strategy_ids']:
            if sid not in self.engines:
                self.engines[sid]=FACTORIES[sid]()
                if sid in self._restored_engine_states:self._restore_engine(self.engines[sid],self._restored_engine_states[sid])
            engine=self.engines[sid]
            costs=ExecutionCosts(spec['contract_size'],lease['commission_quote_per_lot_per_side'],lease['slippage_quote_per_side'],spec['tick_size'],'Account-admin configured quote-currency costs; live spread observed')
            decision=engine.evaluate(snap,costs,now)
            if not decision.plan or decision.opportunity_id in self.seen_opportunities:continue
            plan=decision.plan
            if any(p['symbol']==spec['broker_symbol'] and ((p['side']=='buy')!=(plan.side=='LONG')) for p in positions):continue
            equity_usd=a['equity']/spec['quote_to_account_conversion']
            pct=min(lease['risk_pct'],.25 if equity_usd<=500 else .20 if equity_usd<=5000 else .15)
            headroom=min(a['equity']*pct/100,available,
                         self.guard['day_equity']*lease['daily_loss_pct']/100-(self.guard['day_equity']-a['equity']))
            if headroom<=0:continue
            active=next((b for b in self.books.values() if sid==BasketScalper.strategy_id and b.base_plan.strategy_id==sid and b.state=='OPEN' and b.base_side==plan.side),None)
            allocation=min(headroom,(active.envelope.risk_allowance_money-active.committed_risk(facts)) if active else headroom)
            if sid==BasketScalper.strategy_id:allocation=min(allocation,(active.envelope.risk_allowance_money if active else headroom)*.5)
            sized=self._size(plan,spec,a,lease,allocation)
            if sized is None:continue
            lots,native_budget=sized
            if active is None:
                bid=hashlib.sha256((self.scope['account_id']+plan.opportunity_id).encode()).hexdigest()
                env=BasketEnvelope(self.scope['owner_id'],self.scope['account_id'],bid,self.scope['account_id'],now,self.subscription_until,a['equity'],headroom,a['equity']*lease['max_margin_pct']/100,spec['volume_max'],a['currency'])
                active=BasketBook(plan,env,facts,now,BasketConfig(profit_target_equity_pct=lease['basket_target_pct'],maximum_age_ms=plan.maximum_hold_ms))
                self.books[bid]=active
            order=active.reserve(plan,lots,facts,now)
            comment='ht:'+order.order_id[:24]
            self.links[order.order_id]={'book_id':active.envelope.basket_id,'comment':comment,'symbol':spec['broker_symbol'],'status':'SENDING'}
            self.seen_opportunities.add(plan.opportunity_id);engine.record_admission(decision,now)
            self.save()  # write-ahead: a timeout/crash never repeats this send
            fresh_account=self._identity()
            if self.revoked or self.lease is not lease or self.clock()>=lease['expires_at_ms'] or self.clock()>plan.expires_at_ms or not self._guard(fresh_account,lease,self.clock()):
                active.cancel_confirmed(order.order_id,now);self.links[order.order_id]['status']='CANCELLED_BEFORE_SEND';self.save();return
            result=self.client.place_order(dict(symbol=spec['broker_symbol'],side='buy' if plan.side=='LONG' else 'sell',volume=lots,
                sl=plan.stop,tp=plan.target,comment=comment,magic=MAGIC,action='market',fill_policy='ioc' if 'ioc' in spec['fill_policies'] else 'fok',authorized_risk_amount=native_budget))
            link=self.links[order.order_id];link['status']='UNCERTAIN';link['provider_order_id']=result.get('provider_order_id')
            final_reject=(result.get('success') is False and (result.get('retcode') in (10004,10006,10013,10014,10015,10016,10018,10019) or result.get('error_code') in ('APPROVED_VOLUME_NOT_PROVIDER_EXACT','ATTACHED_SL_TP_REQUIRED','APPROVED_FILL_POLICY_UNAVAILABLE','NATIVE_ENTRY_EXCEEDS_APPROVED_RISK','NATIVE_RISK_EVIDENCE_REQUIRED')))
            if final_reject:
                active.cancel_confirmed(order.order_id,now);link['status']='REJECTED'
            else:active.entry_uncertain(order.order_id,now)
            self._history_at=0;self.save()
            self.last_reason='ENTRY_SUBMISSION_RECONCILIATION_REQUIRED'
            break  # account facts must be re-observed before another reservation

    def start(self):
        if self._thread:return
        def run():
            while not self._stop.is_set():
                try:self.step()
                except Exception as e:
                    self.last_reason=str(e) if isinstance(e,(ValueError,RuntimeError)) else type(e).__name__
                self._stop.wait(.2)
        self._thread=threading.Thread(target=run,name='gold-turbo-local',daemon=True);self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:self._thread.join(timeout=5)
