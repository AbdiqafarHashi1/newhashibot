"""Read-only reconciliation of 16 retained configurations and five Turbo versions.

Net R is source-ledger evidence, never a fresh backtest or customer equity return.
"""
from collections import defaultdict
from datetime import datetime, timezone
import calendar
import gzip
import hashlib
import json
from pathlib import Path
import statistics

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/research/edge-evidence-20261127'
parse=lambda s:datetime.fromisoformat(s.replace('Z','+00:00'))


def metrics(rows):
    vals=[t['realized_r'] for t in rows];g=sum(x for x in vals if x>0);loss=-sum(x for x in vals if x<0)
    curve=peak=drawdown=0
    for x in vals:curve+=x;peak=max(peak,curve);drawdown=max(drawdown,peak-curve)
    return dict(decisions=len(rows),net_r=sum(vals),profit_factor=g/loss if loss else None,expectancy_r=statistics.mean(vals) if vals else None,win_rate_pct=100*sum(x>0 for x in vals)/len(vals) if vals else None,closed_trade_drawdown_r=drawdown,average_holding_minutes=statistics.mean((parse(t['exit_time'])-parse(t['entry_time'])).total_seconds()/60 for t in rows) if rows else None)


def main():
    raw=(ROOT/'src/data/saved-ledger-trades.json').read_bytes();j=json.loads(raw)
    if len(j['trades'])!=1159 or len({(t['strategy_id'],t['id']) for t in j['trades']})!=1159:raise ValueError('LEDGER_CHANGED')
    for s in j['sources']:
        if hashlib.sha256(gzip.decompress((ROOT/s['path']).read_bytes())).hexdigest()!=s['sha256']:raise ValueError('SOURCE_HASH_MISMATCH')
    configs=[]
    for sid in sorted({t['strategy_id'] for t in j['trades']}):
        rows=sorted([t for t in j['trades'] if t['strategy_id']==sid],key=lambda t:t['exit_time'])
        intervals=sorted((parse(c['start']),parse(c['end'])) for c in j['coverage'] if c['strategy']==sid)
        merged=[]
        for lo,hi in intervals:
            if merged and lo<=merged[-1][1]:merged[-1]=(merged[-1][0],max(hi,merged[-1][1]))
            else:merged.append((lo,hi))
        months=[];date=min(x[0] for x in merged).replace(day=1,hour=0,minute=0,second=0,microsecond=0);last=max(x[1] for x in merged)
        while date<last:
            end=date.replace(year=date.year+1,month=1) if date.month==12 else date.replace(month=date.month+1)
            covered=sum((min(hi,end)-max(lo,date)).total_seconds() for lo,hi in merged if hi>date and lo<end)
            if covered>0:
                r=[t for t in rows if date<=parse(t['exit_time'])<end]
                months.append(dict(month=date.strftime('%Y-%m'),complete_market_time_coverage=covered>=(end-date).total_seconds()-1,coverage_calendar_days=covered/86400,**metrics(r)))
            date=end
        # Chronological diagnostic only: versions were selected using prior
        # research, so neither half is claimed to be untouched validation.
        mid=len(rows)//2;full=[m for m in months if m['complete_market_time_coverage']]
        configs.append(dict(strategy_id=sid,evidence_type='RETAINED_COSTED_TRADE_LEDGER_NOT_NEW_ENTRY_BACKTEST',symbols=sorted({t['symbol'] for t in rows}),markets=sorted({t['market'] for t in rows}),timeframes=sorted({t['timeframe'] for t in rows}),coverage=[dict(start=lo.isoformat(),end_exclusive=hi.isoformat()) for lo,hi in merged],**metrics(rows),first_chronological_half=metrics(rows[:mid]),second_chronological_half=metrics(rows[mid:]),months=months,complete_months=len(full),positive_complete_months=sum(m['net_r']>0 for m in full),median_complete_month_r=statistics.median(m['net_r'] for m in full) if full else None,worst_complete_month_r=min((m['net_r'] for m in full),default=None),qualification='Historical source evidence positive; forward execution and customer-specific economics not established by this ledger'))
    # Preserve exactly the latest measured Turbo source, with dates/capital.
    turbo=json.loads((ROOT/'docs/research/gold-turbo-20261126/redesign/comparison.json').read_text())
    latest=[r for r in turbo['results']['candidate_additional'] if r['capital']==25000 and r['lineup'] in ('micro-scalper','momentum-scalper','range-scalper','trend-scalper','price-action-basket')]
    result=dict(schema='hashibot-21-evidence/v1',ledger_sha256=hashlib.sha256(raw).hexdigest(),source_reports_verified=len(j['sources']),existing_configurations=len(configs),existing_decisions=len(j['trades']),configurations=configs,turbo=dict(configurations=5,evidence_type='NATIVE_QUOTE_SCENARIO_REPLAY_NOT_LIVE_FILLS',source='docs/research/gold-turbo-20261126/redesign/comparison.json',period=turbo['periods']['candidate_additional'],results_at_25000=latest),limitations=['All 16 were previously selected; selection bias and shared signals remain. Positive source R does not establish future edge.','Complete-month metrics are NET R, not percent returns. No compounding, subscription subtraction or customer equity performance is invented.','Closed-trade R drawdown excludes unrealized drawdown, gaps, shared-account margin and capital sizing.','Chronological halves are descriptive, not fresh unseen validation.','Market grouping follows actual symbols; forex.complementary-ema-pullback trades XAUUSD.'])
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'scorecard.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    lines=['# HashiBot evidence: 16 retained configurations + five Turbo additions','', 'This reconciles existing evidence. It does not regenerate the 1,159 trades, validate changed entries or establish live customer returns. Every source-report decompression/hash was verified.','', '| Configuration | Decisions | Net R after source costs | PF | First / second half net R | Positive / complete months |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    for r in configs:lines.append(f"| {r['strategy_id']} | {r['decisions']} | {r['net_r']:+.2f} | {r['profit_factor']:.2f} | {r['first_chronological_half']['net_r']:+.2f} / {r['second_chronological_half']['net_r']:+.2f} | {r['positive_complete_months']} / {r['complete_months']} |")
    lines+=['','All 16 have positive aggregate net R in the retained selected ledger. That fact must not be generalized into 16 live-qualified products. The five Turbo strategies have separate, generally weaker evidence; see the frozen source report above.','', 'Each available month, coverage gaps, R expectancy, win rate, holding time and closed-trade R drawdown are in scorecard.json. A zero-trade covered month is included; unobserved months are excluded. Trade exits are assigned to their exit month, without marking open positions to market. Net R is not a percentage account return.','', 'Priority candidates for follow-up can be selected from costed expectancy, chronological stability and month coverage; actual service assignment still needs portfolio/risk/execution verification. No paid/live account or default lineup is activated by this report.','']
    (OUT/'SCORECARD.md').write_text('\n'.join(lines))
    print('Verified',len(configs),'configurations,',len(j['trades']),'decisions and',len(j['sources']),'reports')
    for r in configs:print(r['strategy_id'],round(r['net_r'],2),round(r['profit_factor'],2),'halves',round(r['first_chronological_half']['net_r'],2),round(r['second_chronological_half']['net_r'],2))

if __name__=='__main__':main()
