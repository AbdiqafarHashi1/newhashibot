import importlib.util,lzma,math,pathlib,struct,unittest
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
if __name__=='__main__':unittest.main()
