import gzip,hashlib,importlib.util,json,pathlib,unittest,numpy as np
ROOT=pathlib.Path(__file__).parents[2];spec=importlib.util.spec_from_file_location('filtered',ROOT/'scripts/research/futures-filter-study.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def fixture(sign=1):return np.array([[i*m.STEP,100+sign*i*.1,100+sign*i*.1+.05,100+sign*i*.1-.05,100+sign*i*.1,10]for i in range(400)],float)
class FilterTests(unittest.TestCase):
 def test_original_management_parity(self):
  for sign in [1,-1]:
   a=fixture(sign);self.assertEqual(m.base.simulate(a,200*m.STEP,300*m.STEP),m.simulate_filtered(a,200*m.STEP,300*m.STEP,False))
 def test_uptrend_pullback_short_is_suppressed(self):
  a=fixture();a[200:,1:5]=[100,100.1,99.9,100]
  base=m.simulate_filtered(a,200*m.STEP,240*m.STEP,False);self.assertEqual(len(base),1);self.assertEqual(base[0]['sign'],-1);self.assertEqual(m.simulate_filtered(a,200*m.STEP,240*m.STEP),[])
 def test_mirrored_downtrend_bounce_long_is_suppressed(self):
  a=fixture();a[200:,1:5]=[100,100.1,99.9,100];b=a.copy();b[:,1]=300-a[:,1];b[:,2]=300-a[:,3];b[:,3]=300-a[:,2];b[:,4]=300-a[:,4]
  base=m.simulate_filtered(b,200*m.STEP,240*m.STEP,False);self.assertEqual(base[0]['sign'],1);self.assertEqual(m.simulate_filtered(b,200*m.STEP,240*m.STEP),[])
 def test_directions_costs_and_future_invariance(self):
  for sign in [1,-1]:
   a=fixture(sign);t=m.simulate_filtered(a,200*m.STEP,300*m.STEP)[0];self.assertEqual(t['sign'],sign);cost=(16+3*50)/10000;self.assertAlmostEqual(t['netReturn'],sign*(t['exit']-t['entry'])/t['entry']-cost)
   b=a.copy();b[300:,1:5]*=2;self.assertEqual(m.simulate_filtered(a,200*m.STEP,300*m.STEP),m.simulate_filtered(b,200*m.STEP,300*m.STEP))
 def test_frozen_evidence(self):
  f=ROOT/'docs/research/futures-trend-filter';s=json.loads((f/'summary.json').read_text());z=(f/'evidence.json.gz').read_bytes();raw=gzip.decompress(z);r=json.loads(raw);sha=lambda b:hashlib.sha256(b).hexdigest()
  self.assertEqual(sha(z),s['compressedSha256']);self.assertEqual(sha(raw),s['uncompressedSha256']);self.assertEqual(r['baselineParityTrades'],193)
  for p,h in r['sourceHashes'].items():self.assertEqual(sha((ROOT/p).read_bytes()),h)
  self.assertFalse(r['promotion']);self.assertFalse(r['publication']);self.assertFalse(r['execution'])
  for stage in r['results']:
   if stage['status']!='EVALUATED':continue
   ts=[t for c in stage['cases'] for t in c['trades']]
   for t in ts:
    cost=(16+3*((t['bars']+1)//2))/10000;gross=t['sign']*(t['exit']-t['entry'])/t['entry'];self.assertAlmostEqual(t['cost'],cost);self.assertAlmostEqual(t['netReturn'],gross-cost);self.assertAlmostEqual(t['stressReturn'],gross-1.5*cost)
   for side,sign in [('BUY',1),('SELL',-1)]:
    v=[t['netReturn'] for t in ts if t['sign']==sign];loss=-sum(x for x in v if x<0);pf=sum(x for x in v if x>0)/loss if loss else None;self.assertEqual(len(v),stage['directions'][side]['trades']);self.assertAlmostEqual(pf,stage['directions'][side]['netPF'],places=12)

class SourceTests(unittest.TestCase):
 def test_validation_native_sources(self):
  import base64,csv,io,zipfile
  f=ROOT/'docs/research/futures-trend-filter';snap=json.loads(gzip.decompress((f/'validation-sources.json.gz').read_bytes()));self.assertEqual(len(snap),48);rows_total=0
  for s in snap:
   raw=base64.b64decode(s['archiveBase64']);h=hashlib.sha256(raw).hexdigest();self.assertEqual(h,s['checksumText'].split()[0]);self.assertEqual(h,s['meta']['rawSha256']);self.assertGreaterEqual(s['meta']['month'],'2023-01');self.assertLess(s['meta']['month'],'2025-01')
   with zipfile.ZipFile(io.BytesIO(raw)) as z:rows=list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]))))
   if not rows[0][0].isdigit():rows=rows[1:]
   self.assertEqual(len(rows),s['meta']['rows']);rows_total+=len(rows)
  self.assertEqual(rows_total,8772)

if __name__=='__main__':unittest.main()
