"""Compare one frozen candidate with original engines on both explicit periods."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
from collections import Counter

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('baseline_report',HERE/'report.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
OUT=ROOT/'docs/research/gold-turbo-20261126/step9'


def main():
    original_raw=gzip.decompress((OUT.parent/'baseline-receipts.json.gz').read_bytes())
    paths={'candidate_development':'.tmp/gold-turbo-step9-development.json','original_additional':'.tmp/gold-turbo-step9-original-additional.json','candidate_additional':'.tmp/gold-turbo-step9-candidate-additional.json'}
    data={'original_development':json.loads(original_raw)}
    for key,path in paths.items():data[key]=json.loads((ROOT/path).read_text())
    # Same scenario, quoted path, sessions and cadence for every version pair.
    for period in ('development','additional'):
        a,b=[data[f'{version}_{period}'] for version in ('original','candidate')]
        if a['sessions']!=b['sessions'] or a['assumptions']!=b['assumptions'] or a['processed_original_quotes']!=b['processed_original_quotes'] or a['cadence_ms']!=b['cadence_ms']:
            raise ValueError('NON_EQUIVALENT_COMPARISON:'+period)
    if data['candidate_development']['strategy_file_sha256']!=data['candidate_additional']['strategy_file_sha256']:
        raise ValueError('CANDIDATE_CHANGED_BETWEEN_PERIODS')
    audits={k:r.audit_run(v) for k,v in data.items()}
    deltas={}
    for period in ('development','additional'):
        a,b=[{(row['lineup'],row['capital']):row for row in audits[f'{version}_{period}']} for version in ('original','candidate')]
        deltas[period]=[dict(lineup=key[0],capital=key[1],original_return_pct=a[key]['net_return_pct'],candidate_return_pct=b[key]['net_return_pct'],return_change_pp=b[key]['net_return_pct']-a[key]['net_return_pct'],original_dd_pct=a[key]['maximum_drawdown_pct'],candidate_dd_pct=b[key]['maximum_drawdown_pct'],original_baskets=a[key]['independent_baskets'],candidate_baskets=b[key]['independent_baskets'],original_orders=a[key]['individual_orders'],candidate_orders=b[key]['individual_orders']) for key in a]
    diagnostic={}
    for key,run in data.items():
        diagnostic[key]={}
        for case,fs in run['fills'].items():
            if not case.endswith(':25000'):continue
            exits=[f for f in fs if f['entry']==1]
            diagnostic[key][case]=dict(exit_reasons=dict(Counter(f['reason'] for f in exits)),losing_exit_had_positive_mfe_over_point2=sum(f['profit']<0 and f['mfe_price']>.2 for f in exits),model_net_grouped_by_initial_basket={model:sum(b['net'] for b in run['closed_baskets'][case] if b['entry_model']==model) for model in {b['entry_model'] for b in run['closed_baskets'][case]}})
    payload=json.dumps({k:data[k] for k in paths},separators=(',',':'),allow_nan=False).encode()
    (OUT/'comparison-receipts.json.gz').write_bytes(gzip.compress(payload,mtime=0))
    result=dict(schema='gold-turbo-focused-comparison/v1',source_revision_note='Original engines are the baseline commit. Candidate runs used modified working-tree source based on that parent; exact file hashes, not the parent commit alone, identify the tested candidate.',experiment=json.loads((OUT/'experiment.json').read_text()),receipt_sha256=hashlib.sha256(payload).hexdigest(),source_hashes={k:v.get('strategy_file_sha256') for k,v in data.items()},periods={k:dict(sessions=v['sessions'],quotes=v['processed_original_quotes'],elapsed_seconds=v['elapsed_seconds']) for k,v in data.items()},audited_case_count=sum(len(t) for t in audits.values()),results=audits,comparisons=deltas,diagnostics=diagnostic,limitations=data['candidate_additional']['limitations'])
    (OUT/'comparison.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    for period,rows in deltas.items():
        print(period.upper())
        for row in rows:
            if row['capital']==25000:print(row['lineup'],round(row['original_return_pct'],3),round(row['candidate_return_pct'],3),row['original_baskets'],row['candidate_baskets'])
    print('AUDITED',result['audited_case_count'],'account/basket/flat cases')

if __name__=='__main__':main()
