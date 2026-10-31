"""Finite declared crypto development batch, preserving actual taker flow and checksums."""
import concurrent.futures, csv, datetime, hashlib, io, json, math, pathlib, sys, urllib.request, zipfile

def normalize(rows, symbol):
    out = []
    for row in rows:
        if not row or row[0] == 'open_time':
            continue
        t = int(row[0]); t = t // 1000 if t >= 100_000_000_000_000 else t
        v = [float(row[i]) for i in [1, 2, 3, 4, 5, 7, 8, 9, 10]]
        o, h, l, c, volume, quote, trades, buy, buy_quote = v
        if not all(math.isfinite(x) for x in v) or t % 900000 or l <= 0 or l > min(o, c) or h < max(o, c) or volume < 0 or quote < 0 or not trades.is_integer() or trades < 0 or not 0 <= buy <= volume or not 0 <= buy_quote <= quote:
            raise ValueError('INVALID_NATIVE_KLINE')
        out.append(dict(symbol=symbol, market_type='crypto', timeframe='15m', open_time=datetime.datetime.fromtimestamp(t/1000, datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),
                        open=o, high=h, low=l, close=c, volume=volume, quote_volume=quote, trade_count=int(trades), taker_buy_volume=buy, taker_buy_quote_volume=buy_quote,
                        source='BINANCE_USDM_KLINES', instrument_type='USDT_PERPETUAL'))
    if any(int(datetime.datetime.fromisoformat(b['open_time'].replace('Z','+00:00')).timestamp()*1000) - int(datetime.datetime.fromisoformat(a['open_time'].replace('Z','+00:00')).timestamp()*1000) != 900000 for a, b in zip(out, out[1:])):
        raise ValueError('DUPLICATE_OR_GAPPED_ARCHIVE')
    return out

def main():
    root = pathlib.Path(sys.argv[1]); root.mkdir(parents=True, exist_ok=True)
    p = json.loads(pathlib.Path('scripts/research/cost-aware/protocol.json').read_text())
    if p['developmentFrom'] != '2025-01-01T00:00:00Z' or p['developmentToExclusive'] != '2026-07-01T00:00:00Z':
        raise ValueError('UNREVIEWED_DATA_INTERVAL')
    months = [f'{y}-{m:02d}' for y in [2025, 2026] for m in range(1, 13) if (y,m) <= (2026,6)]
    def job(spec):
        symbol, month = spec; name = f'{symbol}-15m-{month}.zip'; raw_path = root/name
        url = f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/15m/{name}'
        def fetch(u):
            with urllib.request.urlopen(u, timeout=30) as response: return response.read()
        checksum_path = root/(name+'.CHECKSUM')
        if not raw_path.exists(): raw_path.write_bytes(fetch(url))
        if not checksum_path.exists(): checksum_path.write_bytes(fetch(url+'.CHECKSUM'))
        raw = raw_path.read_bytes(); digest = hashlib.sha256(raw).hexdigest()
        if digest != checksum_path.read_text().split()[0]: raise ValueError('OFFICIAL_CHECKSUM_MISMATCH')
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            if z.namelist() != [name.replace('.zip','.csv')]: raise ValueError('UNEXPECTED_ARCHIVE_CONTENTS')
            rows = normalize(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]))), symbol)
        text = json.dumps(rows, separators=(',',':'))+'\n'; output = root/name.replace('.zip','.json'); output.write_text(text)
        meta = dict(sourceUrl=url, rawSha256=digest, datasetSha256=hashlib.sha256(text.encode()).hexdigest(), rows=len(rows), phase='DEVELOPMENT', nativeFlow=True)
        output.with_suffix('.manifest.json').write_text(json.dumps(meta, indent=2)+'\n')
        print(json.dumps({'file':output.name,'rows':len(rows)}), flush=True)
        return meta
    # The bounded batch fails rather than silently omitting an unavailable symbol/month.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(job, [(s,m) for s in p['cryptoSymbols'] for m in months]))
    (root/'sources.json').write_text(json.dumps(sources, indent=2)+'\n')
    print(json.dumps({'status':'COMPLETE','archives':len(sources),'heldoutRequested':False}))
if __name__ == '__main__': main()
