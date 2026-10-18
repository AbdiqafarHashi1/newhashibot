"""Public indicative FX history for offline research only, never the live scanner feed."""
import argparse,hashlib,json,urllib.request,concurrent.futures,math,os,uuid,atexit
from pathlib import Path
from datetime import datetime,timezone
SYMBOLS={'EURUSD':'EURUSD=X','GBPUSD':'GBPUSD=X','USDJPY':'JPY=X','AUDUSD':'AUDUSD=X','USDCAD':'CAD=X','XAUUSD':'XAUUSD=X'}
def download(symbol,ticker,out,timeframe="15m"):
    period="60d" if timeframe=="15m" else "2y"
    url=f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={period}&interval={timeframe}'
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as response:raw=response.read()
        result=json.loads(raw)['chart']['result'][0];quote=result['indicators']['quote'][0]
        now=datetime.now(timezone.utc).timestamp();candles=[];exclusions=[]
        for i,t in enumerate(result['timestamp']):
            values=[quote[k][i] for k in ['open','high','low','close']]
            if t+(900 if timeframe=="15m" else 3600)>now or any(v is None or not math.isfinite(v) or v<=0 for v in values):exclusions.append({'time':t,'reason':'OPEN_OR_INVALID'});continue
            o,h,l,c=values
            if h<max(o,c) or l>min(o,c):exclusions.append({'time':t,'reason':'INVALID_OHLC'});continue
            candles.append(dict(symbol=symbol,market_type='forex',timeframe=timeframe,open_time=datetime.fromtimestamp(t,timezone.utc).isoformat().replace('+00:00','Z'),open=o,high=h,low=l,close=c,volume=0,source='YAHOO_INDICATIVE_FX'))
        if len(candles)<1000:raise ValueError(f'INSUFFICIENT_BARS:{len(candles)}')
        payload=json.dumps(candles,separators=(',',':'))+'\n';(out/f'{symbol}-{timeframe}.json').write_text(payload)
        manifest=dict(symbol=symbol,sourceUrl=url,rawSha256=hashlib.sha256(raw).hexdigest(),datasetSha256=hashlib.sha256(payload.encode()).hexdigest(),rows=len(candles),first=candles[0]['open_time'],last=candles[-1]['open_time'],exclusions=exclusions,brokerCertification=False,limitations=['Indicative OHLC, not executable bid/ask quotes. Spread, slippage and swaps require explicit modeling.','Not MT5 broker history or evidence of prop rule compliance.'])
        (out/f'{symbol}-{timeframe}.raw.json').write_bytes(raw);(out/f'{symbol}-{timeframe}.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        return {'symbol':symbol,'rows':len(candles),'status':'DOWNLOADED'}
    except Exception as e:return {'symbol':symbol,'status':'UNAVAILABLE','error':str(e)}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True);a=p.parse_args();out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    lock = out / '.hashibot-research.lock'
    owner = json.dumps({'pid': os.getpid(), 'token': str(uuid.uuid4())})
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise SystemExit('RESEARCH_WORKSPACE_BUSY: stop the active writer; verify a stale lock PID before removal')
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(owner)
    def release():
        try:
            if lock.read_text() == owner:
                lock.unlink()
        except FileNotFoundError:
            pass
    atexit.register(release)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(lambda item:download(item[0],item[1],out,item[2]),[(s,t,tf) for s,t in SYMBOLS.items() for tf in ['15m','1h']]))
    (out/'availability.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
