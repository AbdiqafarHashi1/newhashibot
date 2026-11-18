"""Genuine Binance archive acquisition with vendor checksums; no credential or trade access."""
import argparse, hashlib, json, pathlib, urllib.request, zipfile, io, csv
p=argparse.ArgumentParser();p.add_argument('--symbols',required=True);p.add_argument('--months',required=True);p.add_argument('--interval',default='5m');p.add_argument('--venue',choices=['spot','usdm'],default='spot');p.add_argument('--out',required=True);a=p.parse_args()
out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
for symbol in a.symbols.split(','):
 for month in a.months.split(','):
  if not symbol.isalnum() or not __import__('re').fullmatch(r'20\d\d-\d\d',month):raise ValueError('Explicit symbol/month required')
  name=f'{symbol}-{a.interval}-{month}.zip';segment='spot' if a.venue=='spot' else 'futures/um'
  url=f'https://data.binance.vision/data/{segment}/monthly/klines/{symbol}/{a.interval}/{name}'
  path=out/name;checksum=urllib.request.urlopen(url+'.CHECKSUM',timeout=30).read().decode();expected=checksum.split()[0]
  data=path.read_bytes() if path.exists() else urllib.request.urlopen(url,timeout=30).read()
  actual=hashlib.sha256(data).hexdigest()
  if actual!=expected:raise ValueError('Vendor checksum mismatch: '+name)
  path.write_bytes(data)
  archive=zipfile.ZipFile(io.BytesIO(data));members=archive.namelist()
  if len(members)!=1 or not members[0].endswith('.csv'):raise ValueError('Unexpected archive')
  rows=list(csv.reader(io.TextIOWrapper(archive.open(members[0]))));rows=[r for r in rows if r and r[0].isdigit()]
  row_payload=json.dumps(rows,separators=(',',':'))
  (out/(name+'.manifest.json')).write_text(json.dumps({'sourceUrl':url,'checksumUrl':url+'.CHECKSUM','sha256':actual,'vendorChecksum':True,'rowsSha256':hashlib.sha256(row_payload.encode()).hexdigest(),'venue':a.venue,'instrument':'SPOT' if a.venue=='spot' else 'USDT_PERPETUAL','symbol':symbol,'interval':a.interval,'month':month,'rows':len(rows),'limitations':['Universe is selected explicitly, not survivorship-neutral','OHLC archive does not contain historical order-book spread or fill evidence']},indent=2)+'\n')
  (out/(name+'.rows.json')).write_text(row_payload)
  print(name,len(rows),actual,flush=True)
