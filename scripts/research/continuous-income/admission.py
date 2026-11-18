"""Canonical confirmed-entry and admission ablation; no production gate changes."""
import json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[3];OUT=ROOT/'.tmp/continuous-income'
ids=['crypto.launch-trend-pullback-48-1.5-5','crypto.launch-trend-pullback-48-2-3-h72','crypto.launch-rsi2-48-3-3-h72']
cases=[('all-production',ids,'PRODUCTION_PARITY','COMBINED'),('focused-production',ids[:1],'PRODUCTION_PARITY','COMBINED'),('all-capacity',ids,'RISK_CAPACITY_ONLY','COMBINED'),('immediate-capacity',ids,'RISK_CAPACITY_ONLY','IMMEDIATE_ONLY'),('conditional-capacity',ids,'RISK_CAPACITY_ONLY','CONDITIONAL_ONLY')]
if __name__=='__main__':
 (OUT/'admission-protocol.json').write_text(json.dumps(dict(period=['2026-08-01','2026-09-01'],symbols=['BTCUSDT','ETHUSDT'],cases=cases,interpretation='One retrospective month; conditional-only still requires canonical confirmation. Capacity-only is a research counterfactual, not removal of provider protection or a production change.'),indent=2))
 for name,selected,admission,entry in cases:
  cmd=['node','--import','tsx','scripts/research/run-frequency-audit.ts','venue=usdm','symbols=BTCUSDT,ETHUSDT','months=2026-07,2026-08','data=.tmp/continuous-income/crypto-data','start=2026-08-01T00:00:00Z','end=2026-09-01T00:00:00Z','balances=500','risks=.5','strategyIds='+','.join(selected),'admission='+admission,'entry='+entry,'out=.tmp/continuous-income/admission-'+name+'.json']
  with (OUT/f'admission-{name}.log').open('w') as f:subprocess.run(cmd,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,check=True)
  print('COMPLETE',name,flush=True)
