"""Audited scalp redesign versus period-9 reference; no parameter selection."""
import gzip
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('audit',HERE/'report.py');audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
OUT=ROOT/'docs/research/gold-turbo-20261126/redesign'


def main():
    previous=json.loads(gzip.decompress((OUT.parent/'step9/comparison-receipts.json.gz').read_bytes()))
    runs={'reference_development':previous['candidate_development']}
    for name in ('development','reference-additional','candidate-additional'):
        key='candidate_development' if name=='development' else name.replace('-','_')
        runs[key]=json.loads((ROOT/f'.tmp/gold-turbo-redesign-{name}.json').read_text())
    if runs['candidate_development']['strategy_file_sha256']!=runs['candidate_additional']['strategy_file_sha256']:raise ValueError('CANDIDATE_NOT_FROZEN')
    tables={k:audit.audit_run(v) for k,v in runs.items()}
    changes={}
    for period in ('development','additional'):
        old,new=[runs[v+'_'+period] for v in ('reference','candidate')]
        if any(old[k]!=new[k] for k in ('sessions','assumptions','cadence_ms','processed_original_quotes')):raise ValueError('UNEQUAL_CONDITIONS:'+period)
        before={(x['lineup'],x['capital']):x for x in tables['reference_'+period]}
        changes[period]=[]
        for row in tables['candidate_'+period]:
            b=before[(row['lineup'],row['capital'])]
            changes[period].append(dict(lineup=row['lineup'],capital=row['capital'],reference_return_pct=b['net_return_pct'],candidate_return_pct=row['net_return_pct'],reference_baskets=b['independent_baskets'],candidate_baskets=row['independent_baskets'],reference_orders=b['individual_orders'],candidate_orders=row['individual_orders'],candidate_dd_pct=row['maximum_drawdown_pct'],candidate_average_hold_minutes=row['average_holding_minutes']))
    diagnostics={}
    for name,run in runs.items():
        diagnostics[name]={}
        for case,fs in run['fills'].items():
            if not case.endswith(':25000'):continue
            diagnostics[name][case]=dict(entry_models=dict(Counter(f['entry_plan']['entry_model'] for f in fs if f['entry']==0)),exit_reasons=dict(Counter(f['reason'] for f in fs if f['entry']==1)))
    raw=json.dumps(runs,separators=(',',':'),allow_nan=False).encode();(OUT/'receipts.json.gz').write_bytes(gzip.compress(raw,mtime=0))
    result=dict(schema='gold-turbo-scalp-redesign/v1',source_note='Reference engine files match bd7a937b. Candidate exact source is identified by module hashes and recorded commit references. No strategy/risk changes between candidate periods.',source_commit_references={k:v['strategy_code_commit'] for k,v in runs.items()},source_hashes={k:v['strategy_file_sha256'] for k,v in runs.items()},experiment=json.loads((OUT/'experiment.json').read_text()),receipt_sha256=hashlib.sha256(raw).hexdigest(),audited_cases=sum(len(t) for t in tables.values()),periods={k:{f:v[f] for f in ('sessions','processed_original_quotes','cadence_ms','assumptions','elapsed_seconds')} for k,v in runs.items()},results=tables,changes=changes,diagnostics=diagnostics,limitations=runs['candidate_additional']['limitations'])
    (OUT/'comparison.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    for period,rows in changes.items():
        print(period.upper())
        for r in rows:
            if r['capital']==25000:print(r['lineup'],round(r['reference_return_pct'],3),round(r['candidate_return_pct'],3),r['candidate_baskets'],r['candidate_orders'])
    print('AUDITED',result['audited_cases'])

if __name__=='__main__':main()
