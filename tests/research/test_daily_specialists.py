import gzip
import importlib.util
import json
import pathlib
import unittest
import hashlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
FOLDER = ROOT/'docs/research/daily-specialists'
SPEC = importlib.util.spec_from_file_location('daily', ROOT/'scripts/research/daily-specialists/study.py')
daily = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(daily)


def report(name):
    return json.loads(gzip.decompress((FOLDER/name).read_bytes()))


class DailySpecialistEvidence(unittest.TestCase):
    def test_signed_bracket_accounting_all_cases_and_retained_failures(self):
        checked = 0
        for name in ['evidence.json.gz', 'ema-bracket.json.gz', 'recent-evidence.json.gz']:
            r = report(name)
            self.assertFalse(r['publication'])
            self.assertFalse(r['execution'])
            for path, digest in r['sourceHashes'].items():
                self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(), digest)
            cases = r.get('cases', [r])
            for c in cases:
                if 'assets' not in c:
                    continue
                pooled = []
                for asset in c['assets']:
                    trades = asset['outcomes']
                    self.assertEqual(daily.metrics(trades), asset['metrics'])
                    for t in trades:
                        if t['netR'] is None:
                            self.assertEqual(t['status'], 'OPEN')
                            continue
                        risk = t['entry']-t['stop']
                        self.assertGreater(risk, 0)
                        gross = (t['exit']-t['entry'])/risk
                        cost = t['entry']*.0026/risk
                        self.assertAlmostEqual(t['grossR'], gross, places=12)
                        self.assertAlmostEqual(t['netR'], gross-cost, places=12)
                        self.assertAlmostEqual(t['stressR'], gross-1.5*cost, places=12)
                        self.assertGreater(t['exitAt'], t['signalAt'])
                        checked += 1
                    pooled.extend(trades)
                self.assertEqual(daily.metrics(pooled), c['pooled'])
        self.assertGreater(checked, 300)
        new = report('evidence.json.gz')
        self.assertEqual(len([c for c in new['cases'] if c.get('stage') == 'DEVELOPMENT']), 3)
        self.assertNotIn('REJECTED_SELLOFF', [c.get('mode') for c in new['cases'] if c.get('stage') == 'VALIDATION'])
        self.assertTrue(report('recent-evidence.json.gz')['failures'])
        bracket = report('ema-bracket.json.gz')
        self.assertTrue(all(not c['failures'] for c in bracket['cases']))
        # Passing old dates cannot suppress failing later evidence.
        self.assertLess(report('recent-evidence.json.gz')['pooled']['netPF'], 1)

    def test_full_watchlist_keeps_losers_and_original_payoff(self):
        r = report('watchlist-evidence.json.gz')
        self.assertEqual(len(r['cases']), 3)
        self.assertEqual(r['protocol']['assets'], ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'LINKUSDT'])
        for path, digest in r['sourceHashes'].items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(), digest)
        self.assertEqual([c['pooled']['trades'] for c in r['cases']], [154, 150, 81])
        for c in r['cases']:
            all_trades = []
            self.assertEqual(len(c['assets']), 6)
            for a in c['assets']:
                for t in a['trades']:
                    gross = t['exit']/t['entry']-1
                    self.assertAlmostEqual(t['grossReturn'], gross, places=12)
                    self.assertAlmostEqual(t['netReturn'], gross-.0026, places=12)
                    self.assertAlmostEqual(t['stressReturn'], gross-.0039, places=12)
                self.assertEqual(daily.spot.metrics(a['trades']), a['metrics'])
                all_trades.extend(a['trades'])
            self.assertEqual(daily.spot.metrics(all_trades), c['pooled'])
        self.assertFalse(r['cases'][0]['failures'])
        self.assertFalse(r['cases'][1]['failures'])
        self.assertIn('NET_PF', r['cases'][2]['failures'])
        self.assertEqual([a['symbol'] for a in r['cases'][2]['assets'] if a['metrics']['meanNet'] < 0], ['SOLUSDT', 'XRPUSDT'])

    def test_every_watchlist_raw_response_matches_origin_hash(self):
        r = report('watchlist-evidence.json.gz')
        bundle = report('watchlist-source-responses.json.gz')['sources']
        by_sha = {hashlib.sha256(raw.encode()).hexdigest(): json.loads(raw) for raw in bundle.values()}
        for source in r['sources']:
            self.assertTrue(source['url'].startswith('https://data-api.binance.vision/api/v3/klines?'))
            rows = by_sha[source['rawSha256']]
            self.assertEqual(len(rows), source['rows'])
            self.assertFalse(source['vendorChecksum'])
            self.assertLessEqual(len(rows), 1000)

    def test_displayed_primary_scope_matches_original_protocol_and_complete_evidence(self):
        primary = json.loads((FOLDER/'primary-summary.json').read_text())
        original = json.loads((ROOT/'scripts/research/spot-swing-protocol.json').read_text())
        broad = report('watchlist-evidence.json.gz')
        self.assertEqual(original['assets'], ['BTCUSDT', 'ETHUSDT'])
        for displayed, complete in zip(primary['stages'], broad['cases']):
            trades = [t for a in complete['assets'] if a['symbol'] in original['assets'] for t in a['trades']]
            self.assertEqual(displayed['pooled'], daily.spot.metrics(trades))
        self.assertEqual(primary['stages'][2]['pooled']['trades'], 25)
        self.assertFalse(primary['publication'])
        self.assertFalse(primary['execution'])

    def test_rsi_wilder_oracle_and_prefix_future_invariance(self):
        self.assertEqual(daily.rsi(np.array([1., 2., 3., 4.]))[-1], 100)
        self.assertEqual(daily.rsi(np.array([4., 3., 2., 1.]))[-1], 0)
        self.assertEqual(daily.rsi(np.array([2., 2., 2., 2.]))[-1], 50)
        bundle = report('watchlist-source-responses.json.gz')['sources']
        native = json.loads(bundle['BTCUSDT-VALIDATION-0.json'])
        a = np.array([[r[0], *map(float, r[1:6])] for r in native])
        original = daily.features(a)
        mutated = a.copy()
        mutated[500:, 1:5] *= 10
        changed = daily.features(mutated)
        for x, y in zip(original, changed):
            np.testing.assert_equal(x[:500], y[:500])
        for mode in ['BULL_DIP', 'REJECTED_SELLOFF', 'SLOW_BREAKOUT']:
            for i in range(249, 500):
                self.assertEqual(daily.signal(a, i, mode, original), daily.signal(mutated, i, mode, changed))


if __name__ == '__main__':
    unittest.main()
