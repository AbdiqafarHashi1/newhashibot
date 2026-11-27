"""Only missing frozen November validation/warmup candles and public funding/specs.

Public first-party Binance futures data. Immutable cached bytes, no credentials.
"""
import concurrent.futures,gzip,hashlib,json,time,urllib.parse,urllib.request
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'docs/research/personal-edge-20261127/data'
SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT']
ms=lambda v:int(datetime.fromisoformat(v).replace(tzinfo=timezone.utc).timestamp()*1000)
END=ms('2026-11-27');START=ms('2026-11-01')


def get(path,params):
    url='https://fapi.binance.com'+path+'?'+urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'HashiBot-validation/1.0'}),timeout=30) as r:raw=r.read()
    value=json.loads(raw)
    if isinstance(value,dict) and 'code' in value:raise RuntimeError(str(value))
    return url,value


def acquire(job):
    kind,symbol,tf,start,end=job;name=f'{kind}-{symbol}-{tf}-{start}-{end}';target=OUT/(name+'.json.gz');manifest=OUT/(name+'.manifest.json')
    if target.exists() and manifest.exists():
        raw=gzip.decompress(target.read_bytes());m=json.loads(manifest.read_text())
        if hashlib.sha256(raw).hexdigest()!=m['rows_sha256']:raise ValueError('CACHED_DATA_HASH_MISMATCH')
        return m
    rows=[];urls=[];cursor=start;width={'4h':14400000,'1h':3600000,'15m':900000,'5m':300000}.get(tf)
    while cursor<end:
        path='/fapi/v1/klines' if kind=='klines' else '/fapi/v1/fundingRate'
        params=dict(symbol=symbol,startTime=cursor,endTime=end-1,limit=1000)
        if kind=='klines':params['interval']=tf
        url,batch=get(path,params);urls.append(url)
        if not isinstance(batch,list):raise ValueError('EXPECTED_ROWS')
        if not batch:break
        rows.extend(batch)
        last=int(batch[-1][0] if kind=='klines' else batch[-1]['fundingTime']);next_at=last+(width if width else 1)
        if next_at<=cursor:raise ValueError('PAGINATION_DID_NOT_ADVANCE')
        cursor=next_at
        if len(batch)<1000:break
    if kind=='klines':
        times=[int(r[0]) for r in rows]
        if times!=list(range(start,end,width)) or any(int(r[6])>=end or float(r[3])<=0 or float(r[2])<max(float(r[1]),float(r[4])) or float(r[3])>min(float(r[1]),float(r[4])) for r in rows):raise ValueError('INCOMPLETE_OR_INVALID_CLOSED_CANDLES:'+name)
    else:
        times=[int(r['fundingTime']) for r in rows]
        if len(set(times))!=len(times) or times!=sorted(times) or any(not start<=t<end for t in times):raise ValueError('FUNDING_TIMES_INVALID')
    raw=json.dumps(rows,separators=(',',':'),allow_nan=False).encode();target.write_bytes(gzip.compress(raw,mtime=0))
    m=dict(kind=kind,symbol=symbol,timeframe=tf,start_ms=start,end_exclusive_ms=end,rows=len(rows),rows_sha256=hashlib.sha256(raw).hexdigest(),source_urls=urls,path=str(target.relative_to(ROOT)),source='BINANCE_USDM_PUBLIC_API',limitations=['OHLC/funding records, not historical bid/ask ticks or fills','API retrieval hash is local provenance, not a vendor-signed checksum'])
    manifest.write_text(json.dumps(m,indent=2)+'\n');print('ACQUIRED',symbol,kind,tf,len(rows),flush=True);return m


def main():
    OUT.mkdir(parents=True,exist_ok=True);jobs=[]
    for symbol in SYMBOLS:
        jobs.append(('klines',symbol,'4h',ms('2026-09-20' if symbol=='ETHUSDT' else '2026-10-01'),START))
        if symbol=='DOGEUSDT':jobs.append(('klines',symbol,'5m',ms('2026-10-31'),END))
        else:jobs.append(('klines',symbol,'15m',ms('2026-10-30') if symbol in ('BTCUSDT','ETHUSDT','SOLUSDT','LTCUSDT') else START,END))
        jobs.append(('funding',symbol,'rates',START,END))
    jobs.append(('klines','ETHUSDT','1h',ms('2026-10-20'),START))
    jobs.append(('klines','ETHUSDT','1h',ms('2026-09-20'),ms('2026-10-20')))  # remaining 960-hour complementary warmup; reuse cached later segment
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:manifests=list(pool.map(acquire,jobs))
    spec=OUT/'exchange-info.json.gz'
    if not spec.exists():
        url,value=get('/fapi/v1/exchangeInfo',{});keep={k:v for k,v in value.items() if k!='symbols'};keep['symbols']=[s for s in value['symbols'] if s['symbol'] in SYMBOLS];spec.write_bytes(gzip.compress(json.dumps(keep,separators=(',',':')).encode(),mtime=0))
    (OUT.parent/'data-index.json').write_text(json.dumps(dict(validation_start_ms=START,validation_end_exclusive_ms=END,manifests=manifests,exchange_specs=dict(path=str(spec.relative_to(ROOT)),source_url='https://fapi.binance.com/fapi/v1/exchangeInfo',rows_sha256=hashlib.sha256(gzip.decompress(spec.read_bytes())).hexdigest(),historical=False,limitation='Current retrieved volume/tick/min-notional requirements are a scenario for historical November; historical maintenance tiers unavailable')),indent=2)+'\n')
    print('SAVED',len(manifests),'datasets',flush=True)

if __name__=='__main__':main()
