"""Bounded official BTC/ETH funding history; retains actual calculation times/intervals."""
import concurrent.futures, csv, hashlib, io, json, math, pathlib, sys, urllib.request, zipfile

root = pathlib.Path(sys.argv[1]); root.mkdir(parents=True, exist_ok=True)
protocol = pathlib.Path('scripts/research/literature-btc-eth-protocol.json').read_bytes()
p = json.loads(protocol)
if p['period'] != {'from':'2025-01-01T00:00:00.000Z','toExclusive':'2026-07-01T00:00:00.000Z'} or p['symbols'] != ['BTCUSDT','ETHUSDT']:
    raise ValueError('UNAPPROVED_ACQUISITION')

def fetch(url):
    with urllib.request.urlopen(url, timeout=25) as response:
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000: raise ValueError('SOURCE_SIZE_BOUND')
        return raw

def job(pair):
    symbol, offset = pair
    year, month = 2025+offset//12, offset%12+1
    name = f'{symbol}-fundingRate-{year}-{month:02d}'
    url = f'https://data.binance.vision/data/futures/um/monthly/fundingRate/{symbol}/{name}.zip'
    archive, checksum_path = root/(name+'.zip'), root/(name+'.zip.CHECKSUM')
    raw = archive.read_bytes() if archive.exists() else fetch(url)
    checksum = checksum_path.read_bytes() if checksum_path.exists() else fetch(url+'.CHECKSUM')
    digest = hashlib.sha256(raw).hexdigest()
    if digest != checksum.decode().split()[0]: raise ValueError('OFFICIAL_CHECKSUM_MISMATCH')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if z.namelist() != [name+'.csv']: raise ValueError('ARCHIVE_IDENTITY')
        reader = csv.DictReader(io.TextIOWrapper(z.open(name+'.csv')))
        if reader.fieldnames != ['calc_time','funding_interval_hours','last_funding_rate']: raise ValueError('NATIVE_SCHEMA_CHANGED')
        rows=[]
        for r in reader:
            t, interval, rate = int(r['calc_time']), int(r['funding_interval_hours']), float(r['last_funding_rate'])
            if t <= 0 or not 1 <= interval <= 24 or not math.isfinite(rate) or abs(rate)>1:
                raise ValueError('INVALID_NATIVE_FUNDING')
            rows.append(dict(calcTimeMs=t, intervalHours=interval, rate=rate, symbol=symbol))
        if not rows or any(b['calcTimeMs']<=a['calcTimeMs'] for a,b in zip(rows,rows[1:])): raise ValueError('NATIVE_ORDERING')
    text=json.dumps(rows,separators=(',',':'))+'\n'
    archive.write_bytes(raw);checksum_path.write_bytes(checksum)
    (root/(name+'.json')).write_text(text)
    meta=dict(sourceUrl=url,rawSha256=digest,datasetSha256=hashlib.sha256(text.encode()).hexdigest(),rows=len(rows),protocolSha256=hashlib.sha256(protocol).hexdigest(),actualIntervals=True)
    (root/(name+'.manifest.json')).write_text(json.dumps(meta,indent=2)+'\n')
    print(json.dumps({'file':name,'rows':len(rows)}),flush=True)
    return meta

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    sources=list(pool.map(job,[(s,i) for s in p['symbols'] for i in range(18)]))
(root/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
