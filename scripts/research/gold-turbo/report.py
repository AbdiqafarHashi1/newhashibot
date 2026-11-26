"""Audit completed tick baseline and produce compact, explicitly partial evidence."""
from collections import defaultdict
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
FOLDER=ROOT/'docs/research/gold-turbo-20261126'


def audit_run(j):
    table=[]
    for row in j['results']:
        key=f"{row['lineup']}:{row['capital']:g}";fills=j['fills'][key];bs=j['closed_baskets'][key]
        realized=sum(f['profit']+f['commission']+f.get('fee',0)+f['swap'] for f in fills)
        if abs(row['final_equity']-row['capital']-realized)>.000001:raise ValueError('ACCOUNT_RECEIPTS_DO_NOT_RECONCILE:'+key)
        if abs(sum(b['net'] for b in bs)-realized)>.000001:raise ValueError('BASKET_RECEIPTS_DO_NOT_RECONCILE:'+key)
        entries={f['position_id'] for f in fills if f['entry']==0}
        for pid in entries:
            opened=sum(f['volume'] for f in fills if f['position_id']==pid and f['entry']==0)
            closed=sum(f['volume'] for f in fills if f['position_id']==pid and f['entry']==1)
            if abs(opened-closed)>1e-8:raise ValueError('NON_FLAT_POSITION:'+key+':'+pid)
        sessions=defaultdict(float)
        for f in fills:
            day=datetime.fromtimestamp(f['time'],timezone.utc).date().isoformat();sessions[day]+=f['profit']+f['commission']
        table.append({k:v for k,v in row.items() if k not in ('entry_reasons','candidate_models')}|dict(selected_session_net_money=dict(sessions),reconciled=True))
    return table


def report():
    path=ROOT/'.tmp/gold-turbo-baseline.json';raw=path.read_bytes();j=json.loads(raw)
    table=audit_run(j)
    ledger=ROOT/'src/data/saved-ledger-trades.json';ledger_raw=ledger.read_bytes();trades=json.loads(ledger_raw)['trades']
    result=dict(schema='gold-turbo-baseline-audit/v1',baseline_sha256=hashlib.sha256(raw).hexdigest(),source_strategy_commit=j['strategy_code_commit'],original_ledger=dict(closed_trades=len(trades),configurations=len({t['strategy_id'] for t in trades}),sha256=hashlib.sha256(ledger_raw).hexdigest(),regenerated=False),data=j['data_manifest'],sessions=j['sessions'],processed_quotes=j['processed_original_quotes'],decision_observations=j['decision_observations'],scenario=j['assumptions'],limitations=j['limitations'],results=table)
    (FOLDER/'baseline-summary.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    # Full receipts remain reviewable and compact in Git; no raw ticks in Git.
    (FOLDER/'baseline-receipts.json.gz').write_bytes(gzip.compress(raw,mtime=0))
    for r in table:
        if r['capital']==25000:print(r['lineup'],round(r['net_return_pct'],3),round(r['maximum_drawdown_pct'],3),r['individual_orders'],r['independent_baskets'])
    print('AUDITED',len(table),'cases; cash, baskets and every position reconcile')

if __name__=='__main__':report()
