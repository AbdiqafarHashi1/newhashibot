"""Bounded real-quote baseline of unchanged local engines and production coordinator.

Offline scenario terminal, never a broker connection. Native stops inspect EVERY
original quote. Entries/management use configurable cadence (default 5s), explicit
adverse slippage and commission. No interpolation, invented ticks or OHLC fills.
"""
import argparse
from bisect import bisect_right
from collections import Counter
from contextlib import nullcontext
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import subprocess
import time
import zipfile
sys.path = [v for v in sys.path if Path(v).resolve() != Path(__file__).resolve().parent]
from dataclasses import asdict
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
AGENT_ROOT=Path(os.environ.get('GOLD_TURBO_AGENT_PATH',str(ROOT/'mt5-agent'))).resolve()
sys.path.insert(0,str(AGENT_ROOT))
from gold_turbo import MarketIntelligence, Candle, Tick
from gold_turbo.runtime import GoldTurboRuntime, FACTORIES, MAGIC

SOURCE = 'EXNESS_XAUUSD_RAW_SPREAD_2026_10'
IDS = list(FACTORIES)
LINEUPS = {**{s.removeprefix('gold.turbo-'):([s], 'SINGLE') for s in IDS},
           'momentum-trend':([IDS[1], IDS[3]], 'CUSTOM'),
           'micro-range-basket':([IDS[0], IDS[2], IDS[4]], 'CUSTOM'),
           'adaptive-all-five':(IDS, 'ADAPTIVE')}


def utc(ms):
    return datetime.fromtimestamp(ms/1000, timezone.utc).isoformat()


class ScenarioTerminal:
    """USD hedging-account SCENARIO, not a statement of Exness specifications."""
    def __init__(self, capital, slip=.02, leverage=100):
        self.initial=self.balance=float(capital);self.slip=slip;self.leverage=leverage
        self.positions=[];self.deals=[];self.fills=[];self.completed=set();self.n=0
        self.now=0;self.bid=self.ask=0;self.max_margin=0.;self.peak=capital;self.dd=0.
        self.runtime=None;self.reasons=Counter();self.entry_models=Counter();self.baskets=[]
    def native_transaction(self):return nullcontext()
    def equity(self):
        return self.balance+sum((self.bid-p['entry_price'] if p['side']=='buy' else p['entry_price']-self.ask)*p['quantity']*100 for p in self.positions)
    def margin(self):return sum(p['quantity']*100*(self.bid+self.ask)/2/self.leverage for p in self.positions)
    def get_account_info(self):
        e=self.equity();return dict(connected=True,login=77,server='HistoricalScenario',environment='demo',trade_allowed=True,trade_expert=True,hedging=True,equity=e,balance=self.balance,free_margin=e-self.margin(),margin=self.margin(),currency='USD')
    def get_terminal_info(self):return dict(connected=True,autotrading=True)
    def get_symbol_info(self,s):
        return dict(broker_symbol='XAUUSD',tick_size=.01,point=.01,stops_level_points=10,contract_size=100,volume_min=.01,volume_step=.01,volume_max=100,bid=self.bid,ask=self.ask,fill_policies=['ioc'],quote_to_account_conversion=1)
    def get_positions(self):return [dict(p) for p in self.positions]
    def get_orders(self):return []
    def gold_turbo_history(self,since):return [d for d in self.deals if d['time']*1000>=since]
    def gold_turbo_order_terminal(self,ticket):return ticket in self.completed
    def gold_turbo_position_risk(self,p):return abs(p['entry_price']-p['sl'])*p['quantity']*100
    def gold_turbo_native_cost(self,symbol,side,lots,entry,stop):return dict(loss=abs(entry-stop)*lots*100,margin=lots*100*entry/self.leverage)
    def normalize_volume(self,q,minimum,maximum,step):return math.floor((q+1e-10)/step)*step
    def place_order(self,p):
        # All orders fill on current observed executable quote, adverse reserve
        # applied; latency is NOT modelled and is explicitly disclosed.
        self.n+=1;n=str(self.n);q=p['volume'];sign=1 if p['side']=='buy' else -1
        price=(self.ask if sign==1 else self.bid)+sign*self.slip
        commission=q*3.5
        if sign*(price-p['sl'])<=0 or sign*(p['tp']-price)<=0 or abs(price-p['sl'])*q*100+2*commission+q*100*self.slip>p['authorized_risk_amount']+1e-8:
            self.completed.add('reject'+n)
            return dict(success=False,retcode=10019,provider_order_id='reject'+n)
        self.balance-=commission
        pos=dict(ticket=n,identifier=n,symbol='XAUUSD',side=p['side'],quantity=q,entry_price=price,sl=p['sl'],tp=p['tp'],magic=MAGIC,comment=p['comment'],time=self.now/1000,opened_ms=self.now,mfe=0.,mae=0.)
        self.positions.append(pos)
        d=dict(ticket='entry'+n,order='order'+n,position_id=n,entry=0,symbol='XAUUSD',comment=p['comment'],volume=q,price=price,commission=-commission,fee=0,profit=0,swap=0,time=self.now/1000)
        self.deals.append(d)
        plans=[o.plan for b in self.runtime.books.values() for oid,o in b.orders.items() if self.runtime.links.get(oid,{}).get('comment')==p['comment']] if self.runtime else []
        self.fills.append(dict(d,entry_plan=asdict(plans[0]) if plans else None));self.completed.add('order'+n)
        return dict(success=True,provider_order_id='order'+n)
    def close_position(self,ticket,volume=None,reason='MANAGEMENT'):
        p=next(p for p in self.positions if p['ticket']==ticket);q=p['quantity'] if volume is None else min(volume,p['quantity'])
        if reason=='MANAGEMENT' and self.runtime:
            actions=[a for b in self.runtime.books.values() for a in b.actions.values() if a.kind=='CLOSE_POSITION' and a.target_id==ticket and a.status in ('READY','SENT','UNCERTAIN')]
            if actions:reason=actions[-1].reason
        sign=1 if p['side']=='buy' else -1;price=(self.bid if sign==1 else self.ask)-sign*self.slip
        profit=(price-p['entry_price'])*sign*q*100;fee=q*3.5
        self.balance+=profit-fee;n=str(len(self.fills));order='close'+n
        d=dict(ticket='exit'+n,order=order,position_id=ticket,entry=1,symbol='XAUUSD',comment='close',volume=q,price=price,commission=-fee,fee=0,profit=profit,swap=0,time=self.now/1000)
        self.deals.append(d);self.fills.append(dict(d,reason=reason,holding_ms=self.now-p['opened_ms'],mfe_price=p['mfe'],mae_price=p['mae']))
        p['quantity']-=q;self.positions=[p for p in self.positions if p['quantity']>1e-8];self.completed.add(order)
        return dict(success=True,provider_order_id=order)
    def modify_position(self,ticket,sl,tp):
        p=next(p for p in self.positions if p['ticket']==ticket);sign=1 if p['side']=='buy' else -1
        if sign*((self.bid if sign==1 else self.ask)-sl)<.1:return dict(success=False,retcode=10016)
        p.update(sl=sl,tp=tp);return dict(success=True)
    def cancel_order(self,ticket):return dict(success=True)
    def quote(self,ms,bid,ask):
        self.now,self.bid,self.ask=int(ms),float(bid),float(ask)
        for p in list(self.positions):
            sign=1 if p['side']=='buy' else -1;px=self.bid if sign==1 else self.ask
            move=sign*(px-p['entry_price']);p['mfe']=max(p['mfe'],move);p['mae']=min(p['mae'],move)
            if sign*(px-p['sl'])<=0:self.close_position(p['ticket'],reason='BROKER_STOP_OBSERVED_QUOTE')
            elif sign*(px-p['tp'])>=0:self.close_position(p['ticket'],reason='BROKER_TARGET_OBSERVED_QUOTE')
        e=self.equity();self.peak=max(self.peak,e);self.dd=max(self.dd,100*(self.peak-e)/self.peak)
        if e>0:self.max_margin=max(self.max_margin,100*self.margin()/e)
    def collect(self):
        r=self.runtime
        for key,b in list(r.books.items()):
            if b.state!='CLOSED':continue
            self.baskets.append(dict(basket_id=key,strategy_id=b.base_plan.strategy_id,entry_model=b.base_plan.entry_model,opened_at_ms=b.envelope.created_at_ms,closed_at_ms=self.now,net=b.realized_net_money,orders=len(b.orders),filled_orders=sum(o.filled_lots>0 for o in b.orders.values())))
            for oid in b.orders:r.links.pop(oid,None)
            for pid in b.positions:r.position_states.pop(pid,None)
            r.books.pop(key);r._marks.pop(key,None)
        # Native lookback retains complete recent receipts; coordinator has already
        # reconciled closed books. Keep active-book entries for repeated scans.
        active={pid for b in r.books.values() for pid in b.positions}
        self.deals=[d for d in self.deals if d['position_id'] in active or self.now-d['time']*1000<60000]
        r._history={k:d for k,d in r._history.items() if d['position_id'] in active or self.now-d['time']*1000<60000}


def bars(path,include_session_edges=False):
    rows=json.loads(path.read_text());df=pd.DataFrame(rows);df.index=pd.to_datetime(df.open_time,utc=True)
    result={}
    for tf in (60000,300000,900000):
        g=df.resample(f'{tf//60000}min').agg(dict(open='first',high='max',low='min',close='last',volume='sum'))
        count=df.close.resample(f'{tf//60000}min').count()
        result[tf]=[Candle('XAUUSD',SOURCE,tf,int(at.value//1000000),r.open,r.high,r.low,r.close,int(r.volume),'BROKER_COMPLETED_BAR') for at,r in g.iterrows() if (count.loc[at]>0 if include_session_edges else count.loc[at]==tf//60000) and not pd.isna(r.close)]
    return result


def runtime(terminal,ids,mode,directory):
    scope=dict(account_id=SOURCE,owner_id='research',bridge_id='scenario',worker_id='scenario',execution_account_id='scenario',login=77,server='HistoricalScenario')
    r=GoldTurboRuntime(terminal,scope,directory,lambda:{'high_impact_in_window':False},lambda:terminal.now)
    # Persistence/heartbeat transport is functionally tested separately; bypass
    # disk/fsync only. Strategy, sizing, basket and guard code remain unchanged.
    r.save=lambda: [b.events.clear() for b in r.books.values()]
    r._publish_status=lambda:None
    def decision(d):
        terminal.reasons.update(d.reasons)
        if d.plan:terminal.entry_models[d.entry_model]+=1
    r._record_decision=decision
    terminal.runtime=r
    lease=dict(schema='gold-turbo-lease/v1',owner_id='research',account_id=SOURCE,bridge_id='scenario',worker_id='scenario',execution_account_id='scenario',environment='demo',account_mode='PERSONAL',server='HistoricalScenario',strategy_ids=ids,selection_mode=mode,risk_pct=.25,daily_loss_pct=1.5,total_loss_pct=8,max_open_risk_pct=1,max_margin_pct=20,session_profit_lock_pct=3,session_trailing_pct=1,basket_target_pct=.2,commission_quote_per_lot_per_side=3.5,slippage_quote_per_side=terminal.slip,hedge_enabled=False,expiry_policy='CLOSE')
    return r,lease


def summarize(t,name):
    net=[b['net'] for b in t.baskets if b['filled_orders']];wins=[v for v in net if v>0];losses=[v for v in net if v<0]
    entries=[f for f in t.fills if f['entry']==0];exits=[f for f in t.fills if f['entry']==1]
    return dict(lineup=name,capital=t.initial,final_equity=t.equity(),net_return_pct=100*(t.equity()/t.initial-1),maximum_drawdown_pct=t.dd,maximum_margin_pct=t.max_margin,independent_baskets=len(net),individual_orders=len(entries),win_rate_pct=100*len(wins)/len(net) if net else None,profit_factor=sum(wins)/-sum(losses) if losses else None,expectancy_money=sum(net)/len(net) if net else None,average_holding_minutes=sum(f['holding_ms']*f['volume'] for f in exits)/sum(f['volume'] for f in exits)/60000 if exits else None,commission_money=-sum(f['commission'] for f in t.fills),account_survived=t.equity()>0,subscription_adjusted_net_at_100_usd=t.equity()-t.initial-100,monthly_statistics=None,monthly_statistics_reason='Selected intraday sessions only; not a complete calendar month or continuous account history',entry_reasons=dict(t.reasons),candidate_models=dict(t.entry_models))


def main():
    p=argparse.ArgumentParser();p.add_argument('--days',default='06,14,22');p.add_argument('--start-hour',type=int,default=8);p.add_argument('--end-hour',type=int,default=16);p.add_argument('--cadence-ms',type=int,default=5000);p.add_argument('--capitals',default='100,500,1000,25000');p.add_argument('--native-quote-bars',action='store_true');p.add_argument('--research-risk-pct',type=float,choices=[1,2,3,5]);p.add_argument('--research-basket-target-pct',type=float,choices=[.2,.4]);p.add_argument('--lineups',default='');p.add_argument('--slippage',type=float,default=.02);p.add_argument('--output',type=Path,default=ROOT/'.tmp/gold-turbo-baseline.json');a=p.parse_args()
    execution_source_hashes={str(v.relative_to(AGENT_ROOT)):hashlib.sha256(v.read_bytes()).hexdigest() for v in sorted((AGENT_ROOT/'gold_turbo').glob('*.py'))}
    execution_protocol=json.loads((AGENT_ROOT/'PERSONAL_RESEARCH_ONLY.json').read_text()) if a.research_risk_pct is not None else None
    execution_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    data=ROOT/'.tmp/gold-micro/data';archive=data/'XAUUSD-2026-10.zip';manifest=json.loads((data/'XAUUSD-1m-2026-10.manifest.json').read_text());digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest!='a131b2c531a58c5e4470f9b65afea4d7894816d7c7bfd580dba70dbe877dc981' or digest!=manifest['archiveSha256']:raise ValueError('ORIGINAL_ARCHIVE_HASH_MISMATCH')
    allbars=bars(data/'XAUUSD-1m-2026-10.json',include_session_edges=a.native_quote_bars);ends={tf:[b.end_ms for b in bs] for tf,bs in allbars.items()}
    starts=[int(pd.Timestamp(f'2026-10-{d}T{a.start_hour:02}:00Z').value//1000000) for d in a.days.split(',')];spans=[(s,s+(a.end_hour-a.start_hour)*3600000) for s in starts]
    if not starts or a.end_hour<=a.start_hour or a.cadence_ms<200:raise ValueError('INVALID_REPLAY_WINDOW')
    cases=[];temp=tempfile.TemporaryDirectory()
    if a.research_risk_pct is not None and not (AGENT_ROOT/'PERSONAL_RESEARCH_ONLY.json').is_file():raise ValueError('RESEARCH_SOURCE_COPY_REQUIRED')
    if a.research_basket_target_pct is not None and a.research_risk_pct is None:raise ValueError('RESEARCH_SOURCE_COPY_REQUIRED')
    selected=set(a.lineups.split(',')) if a.lineups else set(LINEUPS)
    if not selected.issubset(LINEUPS):raise ValueError('UNKNOWN_LINEUP')
    for name,(ids,mode) in LINEUPS.items():
        if name not in selected:continue
        for cap in map(float,a.capitals.split(',')):
            t=ScenarioTerminal(cap,slip=a.slippage);r,lease=runtime(t,ids,mode,Path(temp.name)/f'{name}-{cap}');
            if a.research_risk_pct is not None:lease.update(risk_pct=a.research_risk_pct,daily_loss_pct=15,total_loss_pct=60,max_open_risk_pct=15,max_margin_pct=50,session_profit_lock_pct=20,session_trailing_pct=5)
            if a.research_basket_target_pct is not None:lease['basket_target_pct']=a.research_basket_target_pct
            cases.append((name,t,r,lease))
    eng=None;session=-1;count=0;next_step=0;refresh=-1;quote_count=0;start=time.monotonic();last_progress=start
    with zipfile.ZipFile(archive) as z:
        member=next(n for n in z.namelist() if n.lower().endswith('.csv'))
        for chunk in pd.read_csv(z.open(member),usecols=['Timestamp','Bid','Ask'],chunksize=200000):
            ms=pd.to_datetime(chunk.Timestamp,utc=True,format='mixed').astype('int64').to_numpy()//1000000
            mask=np.zeros(len(ms),dtype=bool)
            for lo,hi in spans:mask|=(ms>=lo-60000)&(ms<hi)
            for at,bid,ask in zip(ms[mask],chunk.Bid.to_numpy()[mask],chunk.Ask.to_numpy()[mask]):
                idx=next(i for i,(lo,hi) in enumerate(spans) if lo-60000<=at<hi)
                if idx!=session:
                    if eng is not None:finish(cases,snap)
                    session=idx;eng=MarketIntelligence('XAUUSD',SOURCE);seed=[b for tf,bs in allbars.items() for b in bs[max(0,bisect_right(ends[tf],int(at))-64):bisect_right(ends[tf],int(at))]]
                    eng.seed_completed(seed,int(at));next_step=int(at);refresh=-1;print('SESSION',utc(int(at)),flush=True)
                tick=Tick('XAUUSD',SOURCE,int(at),float(bid),float(ask));eng.ingest(tick,int(at));quote_count+=1
                for _,t,_,_ in cases:t.quote(at,bid,ask)
                if at<next_step:continue
                next_step=int(at)+a.cadence_ms
                if int(at)//60000!=refresh:
                    update=[bs[j-1] for tf,bs in allbars.items() if (j:=bisect_right(ends[tf],int(at)))>0]
                    eng.refresh_completed(update,int(at));refresh=int(at)//60000
                snap=eng.snapshot(int(at));count+=1
                for _,t,r,lease in cases:
                    r._feed=lambda spec,now,s=snap:s
                    # Explicit historical authorization scenario, never a cloud
                    # bypass in deployed code. New lease every decision cycle.
                    value=dict(lease,issued_at_ms=int(at),expires_at_ms=int(at)+30000,subscription_until_ms=spans[-1][1]+60000)
                    r.set_lease(value)
                    if at<spans[idx][0]:r.set_lease(None)
                    r.step();t.collect()
                if time.monotonic()-last_progress>30:
                    print('PROGRESS',utc(int(at)),quote_count,count,round(time.monotonic()-start,1),flush=True);last_progress=time.monotonic()
    if eng is not None:finish(cases,snap)
    rows=[summarize(t,name) for name,t,_,_ in cases]
    for row in rows:row['baskets_per_selected_session']=row['independent_baskets']/len(spans)
    result=dict(schema='gold-turbo-tick-baseline/v1',bar_aggregation_policy='OBSERVED_NONEMPTY_NATIVE_QUOTE_BUCKETS' if a.native_quote_bars else 'COMPLETE_M1_BUCKETS',personal_research_risk_pct=a.research_risk_pct,personal_research_protocol=execution_protocol,strategy_file_sha256=execution_source_hashes,strategy_code_commit=execution_commit,data_manifest=manifest,archive_sha256=digest,sessions=[dict(start=utc(s),end_exclusive=utc(e)) for s,e in spans],processed_original_quotes=quote_count,decision_observations=count,cadence_ms=a.cadence_ms,elapsed_seconds=time.monotonic()-start,assumptions=dict(account_currency='USD',contract_size_oz=100,minimum_lot=.01,lot_step=.01,leverage=100,broker_min_stop_price=.1,commission_per_lot_per_side_usd=3.5,adverse_slippage_price_per_side=a.slippage,execution_latency_ms=0,news_calendar='UNAVAILABLE: explicit clear-news scenario, not news-filter validation',swap='zero: forced flat at each selected session end',monthly_subscription_usd_scenario=100,risk_per_decision_pct='runtime capped .25 <=500, .20 <=5000, .15 above',daily_loss_pct=1.5,peak_loss_pct=8,max_open_risk_pct=1,max_margin_pct=20,basket_target_pct=.2),limitations=['Dates are explicit in sessions; October was already used in earlier research, not untouched market validation','Scenario broker specs, commission and leverage must be replaced by actual customer broker evidence','5-second decision cadence differs from 200ms live worker; every original quote checks broker stops and targets','Zero order latency, no partial fills/requotes/disconnects; does not qualify live execution','No retained historical economic calendar; production fails closed without one','Selected sessions cannot establish monthly return, profitable-month percentage, survival probability or fee viability','No claim that new strategies are profitable or commercially qualified'],results=rows,closed_baskets={f'{name}:{t.initial:g}':t.baskets for name,t,_,_ in cases},fills={f'{name}:{t.initial:g}':t.fills for name,t,_,_ in cases})
    if a.research_risk_pct is not None:result['assumptions'].update(risk_per_decision_pct=a.research_risk_pct,daily_loss_pct=15,peak_loss_pct=60,max_open_risk_pct=15,max_margin_pct=50,session_profit_lock_pct=20,session_trailing_pct=5)
    if a.research_basket_target_pct is not None:result['assumptions']['basket_target_pct']=a.research_basket_target_pct
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2,allow_nan=False)+'\n');print('SAVED',a.output,round(time.monotonic()-start,1),flush=True)


def finish(cases,snap):
    for _,t,r,_ in cases:
        r.set_lease(None)
        for p in list(t.positions):t.close_position(p['ticket'],reason='SELECTED_SESSION_END')
        for b in r.books.values():b.close_all('SELECTED_SESSION_END',t.now)
        r._history_at=0;r.step();t.collect()
        if t.positions or any(b.state!='CLOSED' for b in r.books.values()):raise RuntimeError('SESSION_DID_NOT_RECONCILE_FLAT')


if __name__=='__main__':main()
