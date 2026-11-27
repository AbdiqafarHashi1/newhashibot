"""Build an isolated, fake-terminal-only research variant. No daemon/server change."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
TARGET=ROOT/'.tmp/personal-turbo-agent'


def main():
    TARGET.mkdir(parents=True,exist_ok=True)
    shutil.copytree(ROOT/'mt5-agent/gold_turbo',TARGET/'gold_turbo',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copy2(ROOT/'mt5-agent/weekend_guard.py',TARGET/'weekend_guard.py')
    path=TARGET/'gold_turbo/runtime.py';original=path.read_text();s=original
    s=s.replace("        self.client,self.scope,self.calendar_reader=client,dict(scope),calendar_reader", "        if type(client).__name__!='ScenarioTerminal' or type(client).__module__ not in ('__main__','turbo_replay'):raise RuntimeError('FAKE_TERMINAL_RESEARCH_ONLY')\n        self.client,self.scope,self.calendar_reader=client,dict(scope),calendar_reader")
    s=s.replace("'risk_pct':(.01,.5),'daily_loss_pct':(1,2),'total_loss_pct':(1,10)","'risk_pct':(.01,5),'daily_loss_pct':(1,15),'total_loss_pct':(1,60)")
    s=s.replace("'max_open_risk_pct':(.01,2),'max_margin_pct':(1,30)","'max_open_risk_pct':(.01,15),'max_margin_pct':(1,50)")
    s=s.replace("pct=min(lease['risk_pct'],.25 if equity_usd<=500 else .20 if equity_usd<=5000 else .15)","pct=lease['risk_pct']  # fixed-size personal research; never the production lease")
    s=s.replace("spec['volume_max'],a['currency'])", "spec['volume_max'],a['currency'],experimental_risk=lease['risk_pct']>2)")
    if s==original or 'FAKE_TERMINAL_RESEARCH_ONLY' not in s or "pct=lease['risk_pct']" not in s:raise ValueError('RESEARCH_PATCH_DID_NOT_APPLY')
    path.write_text(s)
    marker=dict(purpose='PERSONAL_FAKE_TERMINAL_RESEARCH_ONLY',production_runtime_sha256=hashlib.sha256(original.encode()).hexdigest(),research_runtime_sha256=hashlib.sha256(s.encode()).hexdigest(),risk_pct=[1,2,3,5],daily=15,peak=60,open=15,margin=50,basket_target=.2,session_profit_lock=20,session_trailing=5,limitations='Source copy accepts only ScenarioTerminal; no bridge authorization or live/account defaults are modified. Higher loss allowances are experimental, not recommended customer defaults.')
    (TARGET/'PERSONAL_RESEARCH_ONLY.json').write_text(json.dumps(marker,indent=2)+'\n')
    out=ROOT/'docs/research/personal-edge-20261127';out.mkdir(parents=True,exist_ok=True);(out/'turbo-research-protocol.json').write_text(json.dumps(marker,indent=2)+'\n')

if __name__=='__main__':main()
