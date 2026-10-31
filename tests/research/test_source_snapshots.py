import base64,gzip,hashlib,io,json,pathlib,unittest,zipfile

class SnapshotTests(unittest.TestCase):
    def test_spot_exact_native_api_responses(self):
        data=json.loads(gzip.decompress(pathlib.Path('docs/research/spot-swing/source-snapshots.json.gz').read_bytes()))
        self.assertEqual(len(data['sources']),8)
        for s in data['sources']:
            self.assertEqual(hashlib.sha256(s['rawBody'].encode()).hexdigest(),s['metadata']['rawSha256'])
            self.assertFalse(s['metadata']['vendorChecksum'])
            self.assertNotEqual(s['metadata']['stage'],'REUSED_RECENT_DIAGNOSTIC')
            self.assertEqual(len(json.loads(s['rawBody'])),s['metadata']['rows'])

    def test_funding_native_archives_vendor_checksum_and_normalization(self):
        data=json.loads(gzip.decompress(pathlib.Path('docs/research/literature-btc-eth/funding-snapshots.json.gz').read_bytes()))
        self.assertEqual(len(data['sources']),36);records=0
        for s in data['sources']:
            raw=base64.b64decode(s['zipBase64']);digest=hashlib.sha256(raw).hexdigest()
            self.assertEqual(digest,s['checksumText'].split()[0]);self.assertEqual(digest,s['manifest']['rawSha256'])
            self.assertEqual(hashlib.sha256(s['normalizedJson'].encode()).hexdigest(),s['manifest']['datasetSha256'])
            with zipfile.ZipFile(io.BytesIO(raw)) as z:self.assertEqual(z.namelist(),[s['filename'].replace('.zip','.csv')])
            rows=json.loads(s['normalizedJson']);self.assertEqual(len(rows),s['manifest']['rows']);records+=len(rows)
        self.assertEqual(records,3276)

if __name__=='__main__':unittest.main()
