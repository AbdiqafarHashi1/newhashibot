"""Purged chronological DEVELOPMENT walk-forward; no random split, no automatic promotion."""
import datetime, hashlib, json, pathlib, sys
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

def month_start(year,month):
    return int(datetime.datetime(year,month,1,tzinfo=datetime.timezone.utc).timestamp()*1000)
def month_offset(year,month,delta):
    n=year*12+month-1+delta
    return n//12,n%12+1
def main():
    data_path,out=map(pathlib.Path,sys.argv[1:3]);raw=data_path.read_bytes();data=json.loads(raw)
    protocol_path=pathlib.Path('scripts/research/cost-aware/forex-protocol.json' if data['market']=='forex' else 'scripts/research/cost-aware/protocol.json');protocol_raw=protocol_path.read_bytes();p=json.loads(protocol_raw)
    if hashlib.sha256(protocol_raw).hexdigest()!=data['protocolHash']:raise ValueError('PROTOCOL_CHANGED')
    rows=data['samples'];x=np.asarray([r['features'] for r in rows]);y=np.asarray([[r['long']['netR'],r['short']['netR']] for r in rows]);at=np.asarray([r['asOf'] for r in rows]);label_end=np.asarray([r['labelEnd'] for r in rows])
    if not np.isfinite(x).all() or not np.isfinite(y).all():raise ValueError('NONFINITE_TRAINING_DATA')
    models=[];predictions=[];skipped=[]
    # Evaluation is July2025–June2026. Every model sees only the preceding six months.
    for year,month in [month_offset(2025,7,n) for n in range(12)]:
        start=month_start(year,month);next_year,next_month=month_offset(year,month,1);end=month_start(next_year,next_month)
        train_year,train_month=month_offset(year,month,-p['trainingWindowMonths']);minimum=month_start(train_year,train_month)
        train=(at>=minimum)&(label_end<start);test=(at>=start)&(at<end)
        if train.sum()<p.get('minimumTrainingRows',2000) or not test.any():
            if data['market']=='crypto':raise ValueError('INSUFFICIENT_CHRONOLOGICAL_COVERAGE')
            skipped.append({'month':f'{year}-{month:02d}','reason':'INSUFFICIENT_RECOVERED_BROKER_COVERAGE','trainRows':int(train.sum()),'testRows':int(test.sum())});continue
        scaler=StandardScaler().fit(x[train]);xt=np.clip(scaler.transform(x[train]),-5,5);xv=np.clip(scaler.transform(x[test]),-5,5)
        for alpha in p['ridgeAlphas']:
            model=Ridge(alpha=alpha).fit(xt,y[train]);forecast=model.predict(xv)
            params=dict(model_schema=1,feature_count=x.shape[1],long_intercept=float(model.intercept_[0]),short_intercept=float(model.intercept_[1]),
                        trained_through_ms=int(label_end[train].max()),valid_from_ms=start,valid_until_ms=end,publication_approved=0,
                        minimum_predicted_net_r=p['minimumPredictedNetR'],stop_atr=p['stopAtr'],max_bars=p['maxBars'],target_r=p['targetR'],tp1_r=p['tp1R'],
                        estimated_cost_bps=sum(p['costsBps' if data['market']=='forex' else 'cryptoCostsBps'].values()),alpha=alpha)
            for i in range(x.shape[1]):
                params.update({f'mean_{i}':float(scaler.mean_[i]),f'scale_{i}':float(scaler.scale_[i]),f'long_{i}':float(model.coef_[0,i]),f'short_{i}':float(model.coef_[1,i])})
            identity=f'{year}-{month:02d}:alpha={alpha}'
            models.append(dict(id=identity,market=data['market'],timeframe=data['timeframe'],trainingRows=int(train.sum()),evaluationRows=int(test.sum()),trainingStart=minimum,parameters=params))
            for index,pred in zip(np.flatnonzero(test),forecast):
                r=rows[index];side=0 if pred[0]>=pred[1] else 1
                if pred[side]<p['minimumPredictedNetR']:continue
                predictions.append(dict(modelId=identity,alpha=alpha,symbol=r['symbol'],at=r['at'],longNetR=float(pred[0]),shortNetR=float(pred[1]),
                                        side='buy' if side==0 else 'sell',label=r['long' if side==0 else 'short']))
            print(json.dumps({'model':identity,'trainRows':int(train.sum()),'evaluationRows':int(test.sum()),'aboveThreshold':int((forecast.max(axis=1)>=p['minimumPredictedNetR']).sum())}),flush=True)
    out.write_text(json.dumps(dict(schema='cost-aware-models/v1',market=data['market'],protocolHash=data['protocolHash'],trainingFileSha256=hashlib.sha256(raw).hexdigest(),sources=data['sources'],exclusions=data['exclusions'],models=models,predictions=predictions,skipped=skipped,
                                  disclosure='Walk-forward development on previously examined dates. Predicted R is not a win probability or guarantee. No holdout, live publication or execution.',publication=False,execution=False),separators=(',',':'))+'\n')
if __name__=='__main__':main()
