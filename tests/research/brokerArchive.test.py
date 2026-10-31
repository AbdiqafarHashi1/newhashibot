import importlib.util,lzma,pathlib,struct,unittest,tempfile,json
from unittest.mock import patch
path=pathlib.Path(__file__).resolve().parents[2]/'scripts/research/iteration2/download-broker-development.py'
spec=importlib.util.spec_from_file_location('broker_archive',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class BrokerArchiveTests(unittest.TestCase):
 def payload(self,*rows):return lzma.compress(b''.join(struct.pack('>5if',*r) for r in rows))
 def test_exact_utc_prices_and_scale(self):
  rows=module.decode(self.payload((3600,103000,103020,102980,103040,12.5)),'EURUSD',2025,1)
  self.assertEqual(rows[0]['open_time'],'2025-01-01T01:00:00.000Z');self.assertEqual(rows[0]['close'],1.0302);self.assertEqual(rows[0]['low'],1.0298)
  self.assertEqual(module.decode(self.payload((0,153000,153020,152980,153040,5)),'USDJPY',2025,1)[0]['open'],153)
 def test_no_unaligned_future_malformed_or_nonfinite_rows(self):
  cases=[(1,103000,103020,102980,103040,12),(31*86400,103000,103020,102980,103040,12),(0,103000,103020,104000,103040,12),(0,103000,103020,102980,103040,float('nan'))]
  for row in cases:
   with self.subTest(row=row),self.assertRaises(ValueError):module.decode(self.payload(row),'EURUSD',2025,1)
 def test_duplicate_and_bad_lengths_rejected(self):
  row=(0,103000,103020,102980,103040,12)
  with self.assertRaises(ValueError):module.decode(self.payload(row,row),'EURUSD',2025,1)
  with self.assertRaises(ValueError):module.decode(lzma.compress(b'wrong length'),'EURUSD',2025,1)
 def test_partial_source_failure_preserves_health_and_never_normalizes(self):
  raw=self.payload((0,103000,103020,102980,103040,12))
  def fetch(url):
   if '/2025/01/' in url:raise TimeoutError('fixture timeout')
   return raw
  with tempfile.TemporaryDirectory() as tmp,patch.object(module,'fetch',side_effect=fetch),patch('sys.argv',['archive','--output',tmp]),patch('builtins.print'):
   self.assertEqual(module.main(),2)
   health=json.loads((pathlib.Path(tmp)/'health.json').read_text())
   self.assertEqual(health['status'],'INCOMPLETE');self.assertEqual(health['expectedArchives'],160)
   self.assertGreater(len(health['failures']),0);self.assertGreater(health['completedArchives'],0)
   self.assertFalse(list(pathlib.Path(tmp).glob('*-1h.json')))
 def test_probe_failure_records_unavailable(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(module,'fetch',side_effect=TimeoutError('fixture timeout')),patch('sys.argv',['archive','--output',tmp]),patch('builtins.print'):
   self.assertEqual(module.main(),2)
   self.assertEqual(json.loads((pathlib.Path(tmp)/'health.json').read_text())['status'],'UNAVAILABLE')
if __name__=='__main__':unittest.main()
