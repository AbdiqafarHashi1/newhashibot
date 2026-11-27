"""Normalize downloaded native perpetual candles; derive only complete frames."""
import gzip,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];FOLDER=ROOT/'docs/research/personal-edge-20261127'
WIDTH={'5m':300000,'15m':900000,'1h':3600000,'4h':14400000}


def aggregate(rows,source,target):
    sw,tw=WIDTH[source],WIDTH[target];groups={}
    for r in rows:groups.setdefault(r['t']//tw*tw,[]).append(r)
    out=[]
    for at,rs in sorted(groups.items()):
        if [r['t'] for r in rs]!=list(range(at,at+tw,sw)):continue
        out.append(dict(t=at,o=rs[0]['o'],h=max(r['h'] for r in rs),l=min(r['l'] for r in rs),c=rs[-1]['c'],v=sum(r['v'] for r in rs),qv=sum(r['qv'] for r in rs),n=sum(r['n'] for r in rs),tb=sum(r['tb'] for r in rs),tq=sum(r['tq'] for r in rs)))
    return out


def main():
    index=json.loads((FOLDER/'data-index.json').read_text());raws={};funding={}
    for m in index['manifests']:
        raw=gzip.decompress((ROOT/m['path']).read_bytes())
        if hashlib.sha256(raw).hexdigest()!=m['rows_sha256']:raise ValueError('SOURCE_CHANGED')
        values=json.loads(raw)
        if m['kind']=='funding':funding[m['symbol']]=values;continue
        rows=[dict(t=int(r[0]),o=float(r[1]),h=float(r[2]),l=float(r[3]),c=float(r[4]),v=float(r[5]),qv=float(r[7]),n=int(r[8]),tb=float(r[9]),tq=float(r[10])) for r in values]
        raws.setdefault(m['symbol'],{}).setdefault(m['timeframe'],[]).extend(rows)
    start=index['validation_start_ms'];frames={};prices={}
    for symbol,fs in raws.items():
        for tf in fs:
            fs[tf].sort(key=lambda r:r['t'])
            if len({r['t'] for r in fs[tf]})!=len(fs[tf]):raise ValueError('DUPLICATE_CANDLES')
        low='5m' if '5m' in fs else '15m';base=fs[low]
        prices[symbol]=dict(timeframe=low,rows=[r for r in base if r['t']>=start])
        fs['4h']+= [r for r in aggregate(base,low,'4h') if r['t']>=start]
        if symbol=='ETHUSDT':fs['1h']+=[r for r in aggregate(base,low,'1h') if r['t']>=start]
        fs['4h'].sort(key=lambda r:r['t']);frames[symbol]=fs
        for tf,rs in fs.items():
            if any(b['t']-a['t']!=WIDTH[tf] for a,b in zip(rs,rs[1:])):raise ValueError('NONCONTIGUOUS_FRAME:'+symbol+tf)
    spec=json.loads(gzip.decompress((ROOT/index['exchange_specs']['path']).read_bytes()))
    result=dict(start=start,end=index['validation_end_exclusive_ms'],frames=frames,prices=prices,funding=funding,specs={s['symbol']:s for s in spec['symbols']},source_index_sha256=hashlib.sha256((FOLDER/'data-index.json').read_bytes()).hexdigest())
    p=ROOT/'.tmp/personal-crypto-input.json';p.write_text(json.dumps(result,separators=(',',':')))
    print('Prepared',len(frames),'symbols and',sum(len(p['rows']) for p in prices.values()),'native price bars')

if __name__=='__main__':main()
