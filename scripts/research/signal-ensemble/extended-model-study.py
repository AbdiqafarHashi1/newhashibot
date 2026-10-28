import gzip,json,hashlib,math
from pathlib import Path
from datetime import datetime,timedelta
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
import sklearn
ROOT=Path('docs/research/signal-ensemble-extended')
raw=(ROOT/'evidence.json.gz').read_bytes();source=json.loads(gzip.decompress(raw));base_protocol=json.loads(Path('scripts/research/signal-ensemble/model-protocol.json').read_text());extended=json.loads(Path('scripts/research/signal-ensemble/extended-protocol.json').read_text());protocol={**base_protocol,**extended,'model':base_protocol['model']}
def ts(s):return datetime.fromisoformat(s.replace('Z','+00:00'))
def features(t):
 c=t['candidate'];e=c['evidence'];a=e['adaptive_market'];values=[1 if c['side']=='buy' else -1,e['macro_direction'],e['macro_strength'],e['volume_ratio'],e['estimated_cost_r'],c['riskReward'],abs(c['entry']-c['stop'])/c['entry'],a['efficiency'],a['relativeAtr'],a['barRangeAtr'],a['trendAtr']]+[int(c['symbol']==s) for s in ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT']]
 if not all(math.isfinite(v) for v in values):raise ValueError('NONFINITE_CONTEXT')
 return values
models=[];proposals=[];diagnostics=[]
for role in source['raw']:
 trades=role['trades'];train=[t for t in trades if protocol['train']['from']<=t['at']<protocol['train']['until'] and t['outcome']['status'] not in ('OPEN','AMBIGUOUS','EXCLUDED') and t['outcome']['exitTime'] and ts(t['outcome']['exitTime'])+timedelta(minutes=15)<ts(protocol['train']['until'])]
 if len(train)<60:diagnostics.append({'role':role['id'],'blocked':'TRAIN_SAMPLE','train':len(train)});continue
 model=HistGradientBoostingRegressor(**{k:v for k,v in protocol['model'].items() if k!='type'}).fit(np.array([features(t) for t in train]),np.array([t['outcome']['netR'] for t in train]))
 exported={'id':role['id'],'baseline':float(model._baseline_prediction[0,0]),'trainingCount':len(train),'trees':[[{'value':float(n['value']),'feature':int(n['feature_idx']),'threshold':float(n['num_threshold']),'left':int(n['left']),'right':int(n['right']),'leaf':bool(n['is_leaf'])} for n in p[0].nodes] for p in model._predictors]};models.append(exported)
 future=[t for t in trades if t['at']>=protocol['validation']['from']]
 predictions=model.predict(np.array([features(t) for t in future]))
 for t,pred in zip(future,predictions):
  if pred>=.15 and pred-.5*t['candidate']['evidence']['estimated_cost_r']>.05:proposals.append({**t,'prediction':float(pred)})
 diagnostics.append({'role':role['id'],'train':len(train),'proposals':sum(t['candidate']['strategyId']==role['id'] for t in proposals)})
result={'protocol':protocol,'sourceEvidenceSha256':hashlib.sha256(raw).hexdigest(),'studySourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'sklearn':sklearn.__version__,'models':models,'proposals':proposals,'diagnostics':diagnostics,'publication':False,'execution':False,'promotion':False}
Path('docs/research/signal-ensemble-extended-model').mkdir(exist_ok=True);Path('docs/research/signal-ensemble-extended-model/model-proposals.json.gz').write_bytes(gzip.compress(json.dumps(result).encode(),mtime=0));print(json.dumps(diagnostics))
