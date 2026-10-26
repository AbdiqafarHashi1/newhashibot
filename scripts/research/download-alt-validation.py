"""Bounded, read-only public data acquisition AFTER the candidate engine is frozen."""
import concurrent.futures, csv, hashlib, importlib.util, io, json, pathlib, shutil, sys, urllib.request, zipfile

root = pathlib.Path(sys.argv[1])
development = pathlib.Path(sys.argv[2])
frozen = json.loads(pathlib.Path('scripts/research/crypto-alt-validation-frozen.json').read_text())
if frozen['schema'] != 'crypto-alt-validation/v1' or not frozen['developmentPassed']:
    raise ValueError('NO_FROZEN_PASSED_CANDIDATE')
for name, expected in frozen['engineHashes'].items():
    if hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest() != expected:
        raise ValueError('FROZEN_ENGINE_CHANGED:' + name)
root.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('native_normalizer', 'scripts/research/cost-aware/download.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
symbols = ['BTCUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
if frozen['protocol']['symbols'] != symbols:
    raise ValueError('UNAPPROVED_UNIVERSE')
for symbol in symbols:
    for suffix in ['.json', '.manifest.json', '.zip', '.zip.CHECKSUM']:
        name = f'{symbol}-15m-2026-06{suffix}'
        shutil.copyfile(development / name, root / name)

def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read(20_000_001)
        if len(raw) > 20_000_000:
            raise ValueError('SOURCE_SIZE_BOUND')
        return raw

def job(pair):
    symbol, month = pair
    name = f'{symbol}-15m-2026-{month:02d}.zip'
    url = f'https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/15m/{name}'
    raw = fetch(url)
    checksum = fetch(url + '.CHECKSUM')
    digest = hashlib.sha256(raw).hexdigest()
    if digest != checksum.decode().split()[0]:
        raise ValueError('OFFICIAL_CHECKSUM_MISMATCH')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if archive.namelist() != [name.replace('.zip', '.csv')]:
            raise ValueError('ARCHIVE_IDENTITY')
        rows = module.normalize(csv.reader(io.TextIOWrapper(archive.open(archive.namelist()[0]))), symbol)
    text = json.dumps(rows, separators=(',', ':')) + '\n'
    (root / name).write_bytes(raw)
    (root / (name + '.CHECKSUM')).write_bytes(checksum)
    (root / name.replace('.zip', '.json')).write_text(text)
    meta = dict(sourceUrl=url, rawSha256=digest, datasetSha256=hashlib.sha256(text.encode()).hexdigest(), rows=len(rows), phase='FROZEN_VALIDATION', nativeFlow=True)
    (root / name.replace('.zip', '.manifest.json')).write_text(json.dumps(meta, indent=2) + '\n')
    print(json.dumps({'file':name, 'rows':len(rows), 'sha256':digest}), flush=True)
    return meta

# Exactly 12 archives, two concurrent requests, no retry storm, no October prices.
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    sources = list(pool.map(job, [(s, m) for s in symbols for m in [7, 8, 9]]))
(root / 'sources.json').write_text(json.dumps(sources, indent=2) + '\n')
