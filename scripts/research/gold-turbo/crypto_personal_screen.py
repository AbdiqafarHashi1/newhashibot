"""Frozen November Crypto entry screen with explicit experimental Personal sizing.

Native OHLC + paid funding, not bid/ask ticks or a venue execution certification.
"""
import gzip,hashlib,json,math
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'docs/research/personal-edge-20261127'


def floor_step(value,step):return math.floor((value+step*1e-10)/step)*step


class Account:
    def __init__(self,name,ids,capital,risk,leverage,stress,specs,start,end):
        self.name,self.ids,self.initial,self.risk,self.leverage,self.stress=name,set(ids),capital,risk,leverage,stress
        self.balance=float(capital);self.positions={};self.fills=[];self.decisions=[];self.blocked=Counter();self.events=Counter()
        self.peak=float(capital);self.dd=0.;self.adverse_dd=0.;self.max_margin=0.;self.day=None;self.day_equity=capital;self.daily_lock=False;self.total_lock=False
        self.fees=0.;self.funding_net=0.;self.sequence=0;self.specs=specs;self.start,self.end=start,end
    def equity(self,marks):return self.balance+sum(p['side']*(marks.get(sym,p['entry'])-p['entry'])*p['qty'] for sym,p in self.positions.items())
    def margin(self):return sum(p['entry']*p['qty']/self.leverage for p in self.positions.values())
    def mark(self,marks):
        eq=self.equity(marks);self.peak=max(self.peak,eq);self.dd=max(self.dd,100*(self.peak-eq)/self.peak)
        if eq>0:self.max_margin=max(self.max_margin,100*self.margin()/eq)
        return eq
    def exit(self,symbol,reference,at,reason,quantity=None,liquidation=False):
        p=self.positions[symbol];qty=p['qty'] if quantity is None else min(quantity,p['qty']);ratio=qty/p['qty']
        px=reference*(1-p['side']*p['slip']);fee=px*qty*.0005
        if liquidation:fee+=px*qty*p['liquidation_fee']
        gross=p['side']*(px-p['entry'])*qty;entry_fee=p['entry_fee_remaining']*ratio;fund=p['funding_remaining']*ratio
        net=gross-fee-entry_fee-fund;self.balance+=gross-fee;self.fees+=fee
        self.fills.append(dict(position_id=p['id'],strategy_id=p['strategy_id'],symbol=symbol,at=at,side=p['side'],quantity=qty,entry=p['entry'],exit=px,gross=gross,exit_fee=fee,allocated_entry_fee=entry_fee,allocated_funding=fund,net=net,reason=reason))
        p['net_realized']+=net;p['qty']-=qty;p['entry_fee_remaining']-=entry_fee;p['funding_remaining']-=fund
        self.events[reason]+=1
        if p['qty']<max(p['step']*1e-7,1e-12):
            self.decisions.append(dict(position_id=p['id'],strategy_id=p['strategy_id'],symbol=symbol,opened=p['opened'],closed=at,net=p['net_realized'],holding_minutes=(at-p['opened'])/60000,entry_fee=p['entry_fee'],risk_money=p['initial_risk'],quantity=p['original_qty'],entry=p['entry'],initial_stop=p['initial_stop'],maximum_favorable_price_move=p['mfe'],maximum_adverse_price_move=p['mae'],reason=reason))
            del self.positions[symbol]
    def liquidation_price(self,p):
        # Current fixed maintenance scenario, not historical tier/mark precision.
        cushion=max(0,1/self.leverage-.005-p['liquidation_fee']-max(0,p['funding_remaining'])/(p['entry']*p['qty']))
        return p['entry']*(1-p['side']*cushion)
    def process_bar(self,symbol,b,at):
        if symbol not in self.positions:return
        p=self.positions[symbol]
        if p['opened']>b['t']:return
        sign=p['side'];liq=self.liquidation_price(p)
        # An observed open gap can jump beyond both the stop and liquidation.
        if sign*(b['o']-liq)<=0:self.exit(symbol,b['o'],at,'GAP_LIQUIDATION_SCENARIO',liquidation=True);return
        if sign*(b['o']-p['stop'])<=0:self.exit(symbol,b['o'],at,'GAP_STOP');return
        p['mfe']=max(p['mfe'],sign*((b['h'] if sign==1 else b['l'])-p['entry']))
        p['mae']=min(p['mae'],sign*((b['l'] if sign==1 else b['h'])-p['entry']))
        stop_hit=b['l']<=p['stop'] if sign==1 else b['h']>=p['stop']
        target_hit=b['h']>=p['target'] if sign==1 else b['l']<=p['target']
        if stop_hit:self.exit(symbol,p['stop'],at,'STOP_FIRST_OHLC');return
        tp1_hit=b['h']>=p['tp1'] if sign==1 else b['l']<=p['tp1']
        if p['partial_fraction'] and not p['partial_taken'] and tp1_hit:
            qty=floor_step(p['qty']*p['partial_fraction'],p['step'])
            if qty>=p['minimum_qty'] and p['qty']-qty>=p['minimum_qty']-1e-12:
                self.exit(symbol,p['tp1'],at,'TP1_PARTIAL',quantity=qty)
                if symbol not in self.positions:return
                p=self.positions[symbol];p['partial_taken']=True;p['stop']=p['entry']
                be_crossed=b['l']<=p['stop'] if sign==1 else b['h']>=p['stop']
                if be_crossed:self.exit(symbol,p['stop'],at,'CONSERVATIVE_SAME_BAR_BE');return
            else:self.events['PARTIAL_NOT_EXECUTABLE']+=1
        if target_hit:self.exit(symbol,p['target'],at,'TARGET');return
        if at-p['opened']>=p['maximum_hold_ms']:self.exit(symbol,b['c'],at,'TIMEOUT')
    def step(self,at,ending,opening,signals,funding,marks):
        for sym in list(self.positions):
            if sym in ending:self.process_bar(sym,ending[sym],at)
        for sym in list(self.positions):
            p=self.positions[sym]
            for f in funding.get(sym,[]):
                if p['opened']>=at:continue
                recorded_mark=float(f.get('markPrice') or 0)
                mark=recorded_mark if recorded_mark>0 else marks[sym]
                if recorded_mark<=0:self.events['FUNDING_MARK_PROXY']+=1
                cost=p['side']*p['qty']*mark*float(f['fundingRate'])
                self.balance-=cost;p['funding_remaining']+=cost;self.funding_net+=cost
        for sym in list(self.positions):
            if sym not in opening:continue
            p=self.positions[sym];o=opening[sym]['o'];liq=self.liquidation_price(p)
            if p['side']*(o-liq)<=0:self.exit(sym,o,at,'OPEN_GAP_LIQUIDATION_SCENARIO',liquidation=True)
            elif p['side']*(o-p['stop'])<=0:self.exit(sym,o,at,'OPEN_GAP_STOP')
        eq=self.mark(marks);day=at//86400000
        if self.day!=day:self.day=day;self.day_equity=eq;self.daily_lock=False
        if eq<=self.day_equity*.85:self.daily_lock=True
        if eq<=self.peak*.40 or eq<=0:self.total_lock=True
        if self.daily_lock or self.total_lock:
            for sym in list(self.positions):self.exit(sym,marks[sym],at,'DAILY_OR_PEAK_LOCK')
            self.mark(marks);return
        for s in signals:
            if s['strategy_id'] not in self.ids:continue
            sym=s['symbol']
            if sym in self.positions:self.blocked['SYMBOL_LOCK']+=1;continue
            if sym not in opening:self.blocked['NO_NEXT_NATIVE_BAR']+=1;continue
            spec=self.specs[sym];filters={f['filterType']:f for f in spec['filters']}
            lot=filters.get('MARKET_LOT_SIZE',filters['LOT_SIZE']);step=float(lot['stepSize']);minimum=float(lot['minQty']);maximum=float(lot['maxQty'])
            if step<=0:step=float(filters['LOT_SIZE']['stepSize'])
            min_notional=float(filters.get('MIN_NOTIONAL',{}).get('notional',5))
            slip=(.00075 if s['strategy_id']=='crypto.complementary-ema-pullback' else .0003) if not self.stress else (.0015 if s['strategy_id']=='crypto.complementary-ema-pullback' else .001)
            sign=s['side'];entry=opening[sym]['o']*(1+sign*slip);tick=float(filters['PRICE_FILTER']['tickSize'])
            stop=(math.floor(s['stop']/tick) if sign==1 else math.ceil(s['stop']/tick))*tick
            target=(math.floor(s['target']/tick) if sign==1 else math.ceil(s['target']/tick))*tick
            distance=sign*(entry-stop);reward=sign*(target-entry)
            if min(entry,stop,target)<=0 or distance<=0 or reward<=0:self.blocked['GAP_INVALIDATES_GEOMETRY']+=1;continue
            if abs(entry-s['reference'])>.5*distance:self.blocked['ENTRY_CHASE_RESERVE']+=1;continue
            liquidation_fee=float(spec.get('liquidationFee',.0125));cushion=1/self.leverage-.005-liquidation_fee
            if distance/entry+slip+.0005>=cushion:self.blocked['LIQUIDATION_BEFORE_PLANNED_STOP']+=1;continue
            eq=self.equity(marks);openrisk=sum(p['initial_risk'] for p in self.positions.values())
            risk=eq*self.risk/100
            if openrisk+risk>eq*.10+1e-9:self.blocked['CORRELATED_CRYPTO_RISK_CAP']+=1;continue
            unit=distance+(entry+stop)*.0005+stop*slip
            if reward-(entry+target)*.0005-target*slip<=0:self.blocked['COST_EXCEEDS_REWARD']+=1;continue
            margin_room=max(0,eq*.50-self.margin())
            qty=floor_step(min(risk/unit,maximum,margin_room/(entry/self.leverage+entry*.0005)),step)
            if qty<minimum or qty*entry<min_notional:self.blocked['MINIMUM_EXECUTABLE_VOLUME']+=1;continue
            fee=entry*qty*.0005;margin=entry*qty/self.leverage
            if self.margin()+margin+fee>eq*.50+1e-9:self.blocked['MARGIN_CAPACITY']+=1;continue
            self.sequence+=1;self.balance-=fee;self.fees+=fee
            self.positions[sym]=dict(id=f'{self.name}:{self.sequence}',strategy_id=s['strategy_id'],side=sign,entry=entry,stop=stop,initial_stop=stop,target=target,tp1=s['tp1'],partial_fraction=s['partial_fraction'],partial_taken=False,qty=qty,original_qty=qty,step=step,minimum_qty=minimum,opened=at,maximum_hold_ms=s['maximum_hold_ms'],entry_fee=fee,entry_fee_remaining=fee,funding_remaining=0.,net_realized=0.,initial_risk=unit*qty,slip=slip,liquidation_fee=liquidation_fee,mfe=0.,mae=0.)
        self.mark(marks)
    def finish(self,marks):
        open_before=len(self.positions)
        for sym in list(self.positions):self.exit(sym,marks[sym],self.end,'TERMINAL_CLOSE')
        self.mark(marks)
        if abs(self.balance-self.initial-sum(t['net'] for t in self.decisions))>max(1e-6,abs(self.balance)*1e-10):raise ValueError('ACCOUNT_CASH_DOES_NOT_RECONCILE')
        wins=[t['net'] for t in self.decisions if t['net']>0];losses=[t['net'] for t in self.decisions if t['net']<0];count=len(self.decisions)
        return dict(lineup=self.name,capital=self.initial,risk_pct=self.risk,leverage=self.leverage,stress=self.stress,return_pct=100*(self.balance/self.initial-1),ending_balance=self.balance,net_after_full_100_subscription=self.balance-self.initial-100,close_sampled_drawdown_pct=self.dd,maximum_margin_pct=self.max_margin,closed_decisions=count,individual_exit_fills=len(self.fills),win_rate_pct=100*len(wins)/count if count else None,average_win_money=sum(wins)/len(wins) if wins else None,average_loss_money=sum(losses)/len(losses) if losses else None,profit_factor=sum(wins)/-sum(losses) if losses else None,expectancy_money=(self.balance-self.initial)/count if count else None,average_hold_minutes=sum(t['holding_minutes'] for t in self.decisions)/count if count else None,decisions_per_calendar_day=count/26,commission_money=self.fees,funding_net_paid=self.funding_net,open_before_terminal_close=open_before,account_equity_positive=self.balance>0,total_lock=self.total_lock,blocked=dict(self.blocked),events=dict(self.events))


def main():
    data=json.loads((ROOT/'.tmp/personal-crypto-input.json').read_text());signal_data=json.loads((ROOT/'.tmp/personal-crypto-signals.json').read_text())
    ids=sorted({s['strategy_id'] for s in signal_data['signals'] if not s['strategy_id'].startswith('research.')})
    # Include a frozen config even if no opportunities, rather than silently omit.
    ids=sorted(set(ids)|{'crypto.launch-trend-pullback-48-1.5-5','crypto.launch-trend-pullback-48-2-3-h72','crypto.launch-rsi2-48-3-3-h72','crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006','crypto.native-failed-breakout-15-48-3-1.5-ltcusdt-h24-v0.006','crypto.complementary-ema-pullback'})
    prototype='research.crypto-compression-sprint-15m-v1';lineups={i:[i] for i in ids+[prototype]}
    lineups['ADAPTIVE_EXISTING_SIX']=ids;lineups['TREND_AND_VWAP']=['crypto.launch-trend-pullback-48-1.5-5','crypto.native-vwap-reclaim-5-24-2-1.5-dogeusdt-h12-v0.006']
    accounts=[Account(name,selected,cap,risk,lev,stress,data['specs'],data['start'],data['end']) for name,selected in lineups.items() for cap in (100,500,1000,25000) for risk in (1,2,3,5) for lev in (1,10) for stress in (False,True)]
    ending=defaultdict(dict);opening=defaultdict(dict);funds=defaultdict(lambda:defaultdict(list));sigs=defaultdict(list)
    width={'5m':300000,'15m':900000}
    for sym,p in data['prices'].items():
        for b in p['rows']:opening[b['t']][sym]=b;ending[b['t']+width[p['timeframe']]][sym]=b
    for sym,fs in data['funding'].items():
        for f in fs:funds[int(f['fundingTime'])][sym].append(f)
    for s in signal_data['signals']:sigs[s['at']].append(s)
    times=sorted(set(ending)|set(opening)|set(funds));marks={}
    for at in times:
        if not data['start']<=at<=data['end']:continue
        for sym,b in ending[at].items():marks[sym]=b['c']
        for sym,b in opening[at].items():marks[sym]=b['o']
        candidates=sorted(sigs[at],key=lambda s:(-abs(s['target']-s['reference'])/abs(s['reference']-s['stop']),s['strategy_id'],s['symbol'])) if at<data['end'] else []
        for a in accounts:a.step(at,ending[at],opening[at],candidates,funds[at],marks)
    results=[a.finish(marks) for a in accounts]
    payload=dict(schema='fresh-crypto-personal-ohcl-screen/v1',start=data['start'],end_exclusive=data['end'],signal_counts=signal_data['counts'],source_index_sha256=data['source_index_sha256'],source_bundle_sha256=hashlib.sha256((ROOT/'.tmp/personal-crypto-signals.mjs').read_bytes()).hexdigest(),fixed_parameters=json.loads((OUT/'experiment.json').read_text()),results=results,decisions={f'{a.name}:{a.initial}:{a.risk}:{a.leverage}:{a.stress}':a.decisions for a in accounts},limitations=['OHLC screen, not historical bid/ask/mark-price/order-book execution. Intrabar STOP_FIRST and conservative TP1/BE policy are assumptions.','Drawdown is close-sampled account equity, not a verified intrabar maximum. Daily/peak guards act at sampled observations and can overshoot.','Current retrieved lot/notional filters and fixed .5% maintenance scenario are not verified historical margin tiers. Liquidation-before-stop rejection is approximate.','Observed funding uses recorded marks when supplied. Funding/fees reduce equity; no assumption that leverage multiplies returns on unchanged positions.','One November-to-date period cannot establish median monthly returns, profitable-month percentage, future account survival or venue qualification.','Source data includes warmup outside November; signals/positions are restricted to November 1–27 exclusive.','All scenarios are Personal research, no defaults/Prop/live activation; aggressive cases allow severe drawdowns.','Full $100 monthly subscription is an external cost sensitivity, not withdrawn from trading collateral.','The ETH complementary rule is newly screened on perpetual candles, unlike the earlier spot-reference ledger.'])
    raw=json.dumps(payload,separators=(',',':'),allow_nan=False).encode();(OUT/'fresh-crypto-receipts.json.gz').write_bytes(gzip.compress(raw,mtime=0));compact={k:v for k,v in payload.items() if k!='decisions'};(OUT/'fresh-crypto-summary.json').write_text(json.dumps(compact,indent=2,allow_nan=False)+'\n')
    print('AUDITED',len(results),'Crypto scenarios')
    for r in results:
        if r['capital']==500 and r['leverage']==10 and not r['stress'] and r['risk_pct'] in (1,3,5):print(r['lineup'],r['risk_pct'],round(r['return_pct'],2),round(r['close_sampled_drawdown_pct'],2),r['closed_decisions'])

if __name__=='__main__':main()
