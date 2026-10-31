import base64,csv,gzip,hashlib,io,json,pathlib,unittest,zipfile
ROOT=pathlib.Path(__file__).parents[2];F=ROOT/'docs/research/futures-slow-trend';sha=lambda b:hashlib.sha256(b).hexdigest()
class EvidenceTests(unittest.TestCase):
 def test_outcomes_and_gate(self):
  summary=json.loads((F/'summary.json').read_text());z=(F/'evidence.json.gz').read_bytes();raw=gzip.decompress(z);r=json.loads(raw)
  self.assertEqual(sha(z),summary['compressedSha256']);self.assertEqual(sha(raw),summary['uncompressedSha256'])
  for p,h in r['sourceHashes'].items():self.assertEqual(sha((ROOT/p).read_bytes()),h)
  self.assertFalse(r['publication']);self.assertFalse(r['execution']);self.assertFalse(r['promotion']);self.assertEqual(len(r['sources']),72)
  stage=r['results'][0];self.assertEqual(stage['failures'],['DIRECTION_EVIDENCE']);self.assertEqual(r['results'][1]['status'],'BLOCKED_PREVIOUS_STAGE')
  ts=[t for c in stage['cases'] for t in c['trades']];self.assertEqual(len(ts),193)
  for t in ts:
   gross=t['sign']*(t['exit']-t['entry'])/t['entry'];cost=(16+3*((t['bars']+1)//2))/10000
   self.assertAlmostEqual(t['grossReturn'],gross);self.assertAlmostEqual(t['netReturn'],gross-cost);self.assertAlmostEqual(t['stressReturn'],gross-1.5*cost)
   self.assertLess(t['exitBarOpen'],1672531200000);self.assertGreaterEqual(t['exitKnownAt'],t['exitBarOpen']+14400000)
  for side,sign in [('BUY',1),('SELL',-1)]:
   v=[t['netReturn'] for t in ts if t['sign']==sign];pf=sum(x for x in v if x>0)/-sum(x for x in v if x<0)
   self.assertAlmostEqual(pf,stage['directions'][side]['netPF'])
 def test_native_snapshots(self):
  r=json.loads(gzip.decompress((F/'source-snapshots.json.gz').read_bytes()));self.assertEqual(len(r),72);count=0
  for s in r:
   raw=base64.b64decode(s['archiveBase64']);self.assertEqual(sha(raw),s['meta']['rawSha256']);self.assertEqual(s['checksumText'].split()[0],sha(raw));self.assertLess(s['meta']['month'],'2023-01')
   with zipfile.ZipFile(io.BytesIO(raw)) as z:rows=list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]))))
   if not rows[0][0].isdigit():rows=rows[1:]
   self.assertEqual(len(rows),s['meta']['rows']);count+=len(rows)
  self.assertEqual(count,13152)
if __name__=='__main__':unittest.main()
