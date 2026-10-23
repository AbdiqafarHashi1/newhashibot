"""One disclosed nonlinear continuation, preserving all prior linear candidates."""
import datetime,hashlib,json,pathlib,sys
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler

def month_start(year,month):return int(datetime.datetime(year,month,1,tzinfo=datetime.timezone.utc).timestamp()*1000)
def offset(year,month,n):
    total=year*12+month-1+n
    return total//12,total%12+1
def main():
    train_path,baseline_path,output=map(pathlib.Path,sys.argv[1:4]);raw=train_path.read_bytes();data=json.loads(raw);baseline_raw=baseline_path.read_bytes();base=json.loads(baseline_raw)
    nonlinear_raw=pathlib.Path('scripts/research/cost-aware/nonlinear-protocol.json').read_bytes();settings=json.loads(nonlinear_raw)
    p=json.loads(pathlib.Path('scripts/research/cost-aware/forex-protocol.json' if data['market']=='forex' else 'scripts/research/cost-aware/protocol.json').read_bytes())
    if base['trainingFileSha256']!=hashlib.sha256(raw).hexdigest() or any(x['parameters']['model_schema']!=1 for x in base['models']):raise ValueError('BASELINE_LINEAGE_INVALID')
    rows=data['samples'];x=np.asarray([r['features'] for r in rows]);y=np.asarray([[r['long']['netR'],r['short']['netR']] for r in rows]);at=np.asarray([r['asOf'] for r in rows]);label_end=np.asarray([r['labelEnd'] for r in rows]);models=[];predictions=[]
    for year,month in [offset(2025,7,n) for n in range(12)]:
        start=month_start(year,month);end=month_start(*offset(year,month,1));minimum=month_start(*offset(year,month,-6));train=(at>=minimum)&(label_end<start);test=(at>=start)&(at<end)
        if train.sum()<p.get('minimumTrainingRows',2000) or not test.any():continue
        scaler=StandardScaler().fit(x[train]);xt=np.clip(scaler.transform(x[train]),-5,5);xv=np.clip(scaler.transform(x[test]),-5,5)
        params=dict(model_schema=2,feature_count=x.shape[1],trained_through_ms=int(label_end[train].max()),valid_from_ms=start,valid_until_ms=end,publication_approved=0,
                    minimum_predicted_net_r=p['minimumPredictedNetR'],stop_atr=2,max_bars=32,target_r=2.5,tp1_r=1,
                    estimated_cost_bps=sum(p['costsBps' if data['market']=='forex' else 'cryptoCostsBps'].values()),alpha=-1,tree_count=settings['n_estimators'],learning_rate=settings['learning_rate'])
        for i in range(x.shape[1]):params.update({f'mean_{i}':float(scaler.mean_[i]),f'scale_{i}':float(scaler.scale_[i])})
        forecasts=[]
        for head in range(2):
            model=GradientBoostingRegressor(n_estimators=settings['n_estimators'],max_depth=settings['max_depth'],learning_rate=settings['learning_rate'],loss=settings['loss'],
                    min_samples_leaf=settings['min_samples_leaf_'+data['market']],random_state=settings['random_state']).fit(xt,y[train,head])
            forecasts.append(model.predict(xv));params['long_intercept' if head==0 else 'short_intercept']=float(model.init_.constant_[0,0])
            for t,estimator in enumerate(model.estimators_[:,0]):
                tree=estimator.tree_;prefix=f'h{head}t{t}';params[prefix+'_count']=int(tree.node_count)
                for node in range(tree.node_count):
                    key=f'{prefix}n{node}';feature=int(tree.feature[node]);params[key+'f']=feature
                    if feature==-2:params[key+'v']=float(tree.value[node,0,0])
                    else:params.update({key+'b':float(tree.threshold[node]),key+'l':int(tree.children_left[node]),key+'r':int(tree.children_right[node])})
        forecast=np.column_stack(forecasts);identity=f'{year}-{month:02d}:shallow-trees';models.append(dict(id=identity,market=data['market'],timeframe=data['timeframe'],trainingRows=int(train.sum()),evaluationRows=int(test.sum()),trainingStart=minimum,parameters=params))
        for index,pred in zip(np.flatnonzero(test),forecast):
            side=0 if pred[0]>=pred[1] else 1
            if pred[side]<p['minimumPredictedNetR']:continue
            r=rows[index];predictions.append(dict(modelId=identity,alpha=-1,symbol=r['symbol'],at=r['at'],longNetR=float(pred[0]),shortNetR=float(pred[1]),side='buy' if side==0 else 'sell',label=r['long' if side==0 else 'short']))
        print(json.dumps({'model':identity,'market':data['market'],'aboveThreshold':int((forecast.max(axis=1)>=p['minimumPredictedNetR']).sum())}),flush=True)
    base['models'].extend(models);base['predictions'].extend(predictions);base['nonlinearProtocolSha256']=hashlib.sha256(nonlinear_raw).hexdigest();base['linearBaselineSha256']=hashlib.sha256(baseline_raw).hexdigest()
    output.write_text(json.dumps(base,separators=(',',':'))+'\n')
if __name__=='__main__':main()
