"""Verify cached decoded rows against the exact vendor-checksummed ZIP, offline.
Never invent/repair candles. A mismatch aborts; only integrity metadata is updated.
"""
import argparse,pathlib,json,hashlib,zipfile,csv,io
p=argparse.ArgumentParser();p.add_argument('folders',nargs='+');a=p.parse_args();checked=[]
for folder in a.folders:
 for manifest_path in sorted(pathlib.Path(folder).glob('*.zip.manifest.json')):
  m=json.loads(manifest_path.read_text());archive=manifest_path.with_name(manifest_path.name.removesuffix('.manifest.json'));data=archive.read_bytes()
  if not m.get('vendorChecksum') or hashlib.sha256(data).hexdigest()!=m['sha256']:raise ValueError('VENDOR_ARCHIVE_INTEGRITY_FAILED:'+str(archive))
  z=zipfile.ZipFile(io.BytesIO(data));names=z.namelist()
  if len(names)!=1 or not names[0].endswith('.csv'):raise ValueError('UNEXPECTED_VENDOR_ARCHIVE')
  rows=[r for r in csv.reader(io.TextIOWrapper(z.open(names[0]))) if r and r[0].isdigit()];rows_path=archive.with_name(archive.name+'.rows.json');raw=rows_path.read_bytes()
  if rows!=json.loads(raw):raise ValueError('DECODED_ROWS_DIFFER_FROM_VENDOR:'+str(rows_path))
  m['rowsSha256']=hashlib.sha256(raw).hexdigest();m['decodedRowsVerifiedAgainstArchive']=True;manifest_path.write_text(json.dumps(m,indent=2)+'\n');checked.append({'sourceUrl':m['sourceUrl'],'sha256':m['sha256'],'rowsSha256':m['rowsSha256'],'rows':len(rows)})
print(json.dumps({'schema':'mission2-dataset-integrity/v1','archives':checked,'count':len(checked)},indent=2))
