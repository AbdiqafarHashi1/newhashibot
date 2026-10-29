import gzip,json,pathlib,datetime,hashlib
root=pathlib.Path('../research-data/ten-asset');native=json.loads(gzip.decompress(pathlib.Path('docs/research/daily-connected/native-fixtures.json.gz').read_bytes()));start='2025-04-12T12:00:00.000Z';end='2025-04-12T18:00:00.000Z';first='2025-04-02T12:00:00.000Z';datasets=[];sources=[]
for a in native['assets']:datasets.append({'symbol':a['symbol'],'candles':[c for c in a['candles']if c['open_time']<end]})
p=json.loads(pathlib.Path('scripts/research/ten-asset/protocol.json').read_text())
for symbol in ['BTCUSDT',*p['altAssets']]:
 name=f'{symbol}-15m-2025-04';raw=(root/(name+'.json')).read_bytes();meta=json.loads((root/(name+'.manifest.json')).read_text());assert hashlib.sha256(raw).hexdigest()==meta['datasetSha256'];sources.append(meta);datasets.append({'symbol':symbol,'candles':[c for c in json.loads(raw)if first<=c['open_time']<end]})
pathlib.Path('tests/tenAsset/native-fixture.json.gz').write_bytes(gzip.compress(json.dumps({'start':start,'end':end,'datasets':datasets,'sources':sources,'classification':'GENUINE_ALREADY_OBSERVED_NOT_NEW_HOLDOUT'}).encode(),mtime=0));print('saved',len(datasets),'datasets')
