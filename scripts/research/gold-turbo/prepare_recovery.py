"""Isolated fake-terminal paired experiment; never alters deployed permissions."""
import importlib.util,json,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
spec=importlib.util.spec_from_file_location('prepare_personal',HERE/'prepare_personal_turbo.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def main():
    old=ROOT/'docs/research/personal-edge-20261127/turbo-research-protocol.json';saved=old.read_bytes()
    m.TARGET=ROOT/'.tmp/turbo-recovery-agent'
    try:m.main()
    finally:old.write_bytes(saved)
    p=m.TARGET/'gold_turbo/runtime.py';s=p.read_text();needle="maximum_age_ms=plan.maximum_hold_ms))"
    if s.count(needle)==1:
        s=s.replace(needle,"maximum_age_ms=plan.maximum_hold_ms,profit_exit_mode=lease.get('profit_exit_mode','EQUITY_TARGET') if sid!=BasketScalper.strategy_id else 'EQUITY_TARGET'))")
    elif "profit_exit_mode=lease.get('profit_exit_mode','EQUITY_TARGET') if sid!=BasketScalper.strategy_id else 'EQUITY_TARGET'" not in s:raise ValueError('RECOVERY_PATCH_DRIFT')
    p.write_text(s)
    marker=m.TARGET/'PERSONAL_RESEARCH_ONLY.json';d=json.loads(marker.read_text());d['research_runtime_sha256']=hashlib.sha256(p.read_bytes()).hexdigest();d['non_flagship_profit_modes']=['EQUITY_TARGET','STRATEGY_EXITS'];marker.write_text(json.dumps(d,indent=2)+'\n')
    out=ROOT/'docs/research/strategy-recovery-20261127';out.mkdir(exist_ok=True);(out/'paired-protocol.json').write_text(json.dumps(dict(source=d,days=['2026-10-06','2026-10-14','2026-10-22'],hours_utc=[8,16],capital=[500,25000],risk_pct=1,arms=['BASELINE','STRATEGY_EXITS','SESSION_BREAKOUT_WITH_STRATEGY_EXITS'],cadence_ms=5000,interpretation='Paired known development sessions; no pristine unseen claim. Flagship retains its basket equity target. Opening model changes standalone Momentum and its adaptive competition, not flagship child engines. No parameter search or defaults promotion.'),indent=2)+'\n')

if __name__=='__main__':main()
