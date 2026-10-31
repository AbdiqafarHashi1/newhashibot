"""Independent recorded-evidence arithmetic; not exchange or scanner certification."""
import gzip, hashlib, json, math, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research/public-playbooks'
def pf(values):
    gain=math.fsum(v for v in values if v>0)
    loss=-math.fsum(v for v in values if v<0)
    return gain/loss if loss else None
class RecordedEvidence(unittest.TestCase):
    def test_source_hashes_and_no_promotion(self):
        for name in ['evidence','references','higher','limits']:
            d=json.loads(gzip.decompress((OUT/(name+'.json.gz')).read_bytes()))
            self.assertIs(d['promotion'],False);self.assertIs(d['publication'],False);self.assertIs(d['execution'],False)
            for path,expected in d['sourceHashes'].items():
                self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),expected,path)
    def test_protected_pf_and_cashflows(self):
        count=0
        for name in ['evidence','higher','limits']:
            d=json.loads(gzip.decompress((OUT/(name+'.json.gz')).read_bytes()))
            for case in d.get('results',d.get('cases',[])):
                closed=[]
                for trade in case['trades']:
                    o=trade['outcome']
                    if o['status']=='OPEN':
                        self.assertIsNone(o['netR']);continue
                    closed.append(o['netR']);count+=1
                    self.assertAlmostEqual(o['grossR']-o['costR'],o['netR'],places=8)
                    self.assertTrue(math.isfinite(o['netR']))
                self.assertEqual(len(closed),case['summary']['resolved'])
                expected=pf(closed)
                if expected is None:self.assertIsNone(case['summary']['netPF'])
                else:self.assertAlmostEqual(expected,case['summary']['netPF'],places=10)
        self.assertGreater(count,10000)
    def test_reference_percentage_accounting(self):
        d=json.loads(gzip.decompress((OUT/'references.json.gz').read_bytes()))
        for case in d['cases']:
            values=[]
            for t in case['trades']:
                gross=t['exitPrice']/t['entryPrice']-1
                net=gross-.0016-t['fundingQuote']/t['entryPrice']
                self.assertAlmostEqual(net,t['netReturn'],places=12);values.append(net)
            self.assertEqual(case['resolved'],len(values))
            expected=pf(values)
            if expected is not None:self.assertAlmostEqual(expected,case['netPF'],places=9)
            self.assertIs(case['productionApproved'],False)
if __name__=='__main__':unittest.main()
