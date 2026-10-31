"""Audit cached broker BID/ASK archives without requesting missing or held-out prices."""
import hashlib,importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('broker_decoder','scripts/research/iteration2/download-broker-development.py')
decoder=importlib.util.module_from_spec(spec);spec.loader.exec_module(decoder)
root=pathlib.Path(sys.argv[1]);output=pathlib.Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
p=json.loads(pathlib.Path('scripts/research/cost-aware/protocol.json').read_text());coverage=[]
for symbol in p['forexSymbols']:
    rows=[];sources=[];missing=[];zero_volume=0;unpaired=0
    for y in [2025,2026]:
        for m in range(1,13):
            if (y,m)>(2026,6):continue
            bid=root/f'{symbol}-{y}-{m:02d}-BID.bi5';ask=root/f'{symbol}-{y}-{m:02d}-ASK.bi5'
            if not bid.exists() or not ask.exists():missing.append(f'{y}-{m:02d}');continue
            br=bid.read_bytes();ar=ask.read_bytes();b=decoder.decode(br,symbol,y,m);a=decoder.decode(ar,symbol,y,m);amap={r['open_time']:r for r in a}
            for r in b:
                q=amap.get(r['open_time'])
                if q is None:unpaired+=1;continue
                if any(q[k]<r[k] for k in ['open','high','low','close']):raise ValueError('CROSSED_BID_ASK:'+symbol)
                if r['volume']<=0 or q['volume']<=0:zero_volume+=1;continue
                rows.append({**r,'ask_open':q['open'],'ask_high':q['high'],'ask_low':q['low'],'ask_close':q['close']})
            sources.append({'month':f'{y}-{m:02d}','bidSha256':hashlib.sha256(br).hexdigest(),'askSha256':hashlib.sha256(ar).hexdigest(),
                            'bidUrl':f'https://datafeed.dukascopy.com/datafeed/{symbol}/{y}/{m-1:02d}/BID_candles_hour_1.bi5',
                            'askUrl':f'https://datafeed.dukascopy.com/datafeed/{symbol}/{y}/{m-1:02d}/ASK_candles_hour_1.bi5'})
    text=json.dumps(rows,separators=(',',':'))+'\n';(output/f'{symbol}-1h.json').write_text(text)
    status={'symbol':symbol,'status':'COMPLETE' if not missing and not unpaired else 'PARTIAL', 'rows':len(rows),'missingMonths':missing,
            'zeroVolumeNonObservationRowsExcluded':zero_volume,'unpairedBidRows':unpaired,'datasetSha256':hashlib.sha256(text.encode()).hexdigest(),
            'sources':sources,'quotes':'Native broker BID/ASK OHLC, not executable fills or tick path. No synthetic weekend candles.'}
    (output/f'{symbol}-1h.manifest.json').write_text(json.dumps(status,indent=2)+'\n');coverage.append(status)
(output/'coverage.json').write_text(json.dumps({'status':'PARTIAL' if any(x['status']!='COMPLETE' for x in coverage) else 'COMPLETE',
                                             'coverage':coverage,'forexCertification':'BLOCKED_INCOMPLETE_PROVIDER_COVERAGE','publication':False,'execution':False},indent=2)+'\n')
print(json.dumps([{'symbol':x['symbol'],'rows':x['rows'],'missingMonths':len(x['missingMonths'])} for x in coverage]))
