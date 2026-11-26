"""Offline, read-only verification of retained Mission 1 evidence. No downloads/reruns.

Run from any directory; JSON is written to stdout. Redirect it to retain a checkpoint.
"""
import collections
import datetime
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import tarfile

ROOT = Path(__file__).resolve().parents[3]


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def inspect():
    path = ROOT / 'src/data/saved-ledger-trades.json'
    payload = path.read_bytes()
    ledger = json.loads(payload)
    trades = ledger['trades']
    identities = {(t['strategy_id'], t['id']) for t in trades}
    ids = {t['strategy_id'] for t in trades}
    if len(trades) != 1159 or len(identities) != 1159 or len(ids) != 16:
        raise ValueError('EXPECTED_1159_UNIQUE_TRADES_AND_16_CONFIGURATIONS')
    parse = lambda s: datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
    for row in trades:
        if not math.isfinite(row['realized_r']) or parse(row['entry_time']) > parse(row['exit_time']):
            raise ValueError('INVALID_LEDGER_ROW')
        if row.get('entry_feature_at') and parse(row['entry_feature_at']) > parse(row['entry_time']):
            raise ValueError('FUTURE_ENTRY_FEATURE')

    shared = ROOT / 'supabase/functions/_shared'
    reviews = '\n'.join((shared / name).read_text() for name in (
        'launch-canonical-reviews.ts', 'frontier-canonical-reviews.ts',
        'rsi-trailing-canonical-reviews.ts'))
    reviewed_ids = set(re.findall(r'[\'\"]?strategyId[\'\"]?\s*:\s*[\'\"]([^\'\"]+)', reviews))
    expected = reviewed_ids | {'crypto.complementary-ema-pullback', 'forex.complementary-ema-pullback'}
    if ids != expected:
        raise ValueError('LEDGER_CATALOG_IDS_DIFFER')
    sources = []
    manifests = {}
    for source in ledger['sources']:
        raw = gzip.decompress((ROOT / source['path']).read_bytes())
        if digest(raw) != source['sha256']:
            raise ValueError('SOURCE_HASH_MISMATCH:' + source['path'])
        report = json.loads(raw)
        sources.append({**source, 'verified': True})
        for m in report.get('manifests', []):
            key = (m.get('sourceUrl'), m.get('rowsSha256'), m.get('timeframe', m.get('interval')))
            manifests[key] = m
    if not {t['source_sha256'] for t in trades}.issubset({s['sha256'] for s in sources}):
        raise ValueError('UNRESOLVED_TRADE_SOURCE')

    groups = []
    for strategy in sorted(ids):
        rows = [t for t in trades if t['strategy_id'] == strategy]
        groups.append({
            'id': strategy, 'closedTrades': len(rows),
            'symbols': sorted({t['symbol'] for t in rows}),
            'markets': sorted({t['market'] for t in rows}),
            'timeframes': sorted({t['timeframe'] for t in rows}),
            'firstEntry': min(t['entry_time'] for t in rows),
            'lastExit': max(t['exit_time'] for t in rows),
            'sourceCoverage': [c for c in ledger['coverage'] if c['strategy'] == strategy],
        })

    research = ROOT / 'docs/research/gold-micro-20261114'
    checksum_map = json.loads((research / 'SHA256SUMS.json').read_text())
    for name, wanted in checksum_map.items():
        if digest((research / name).read_bytes()) != wanted:
            raise ValueError('GOLD_RESEARCH_HASH_MISMATCH:' + name)
    archives = []
    for archive in sorted((ROOT / 'docs/research').rglob('*.tar.gz')):
        with tarfile.open(archive) as stream:
            members = stream.getmembers()
            data = [m.name for m in members if m.isfile() and Path(m.name).suffix.lower()
                    in {'.csv', '.parquet', '.npz', '.npy', '.zip', '.bin'}]
        archives.append({'path': str(archive.relative_to(ROOT)), 'members': len(members),
                         'marketDataExtensionCandidates': data})
    micro = json.loads((research / 'data-manifests.json').read_text())
    for m in micro:
        month = m['month']
        m['localTickArchiveExists'] = (ROOT / f'.tmp/gold-micro/data/XAUUSD-{month}.zip').is_file()
        m['localM1RowsExist'] = (ROOT / f'.tmp/gold-micro/data/XAUUSD-1m-{month}.json').is_file()

    return {
        'schema': 'gold-turbo-inspection/v1',
        'inspectedBaseCommit': 'ae0dc5a32b7604ad9150c5bd8dcecced6975afb0',
        'ledger': {'path': str(path.relative_to(ROOT)), 'sha256': digest(payload),
                   'trades': len(trades), 'uniqueConfigurationTrades': len(identities),
                   'configurations': len(ids), 'catalogIdsMatch': True,
                   'marketCounts': dict(collections.Counter(t['market'] for t in trades)),
                   'withSavedPeakR': sum(t.get('peak_r') is not None for t in trades),
                   'withEntryGeometry': sum(t.get('entry_price') is not None and t.get('initial_stop') is not None for t in trades),
                   'costs': ledger['costs'], 'limitations': ledger['limitations'],
                   'configurationsDetail': groups, 'verifiedSources': sources},
        'sourceMarketManifests': sorted(manifests.values(), key=lambda m: (m.get('sourceUrl', ''), m.get('rowsSha256', ''))),
        'goldMicro': {'checksumsVerified': len(checksum_map), 'manifests': micro,
                      'reportedTicksNotLocallyRecounted': sum(m['ticks'] for m in micro),
                      'reportedM1RowsNotLocallyRecounted': sum(m['rows'] for m in micro)},
        'researchSourceArchives': archives,
        'limits': [
            'Report hashes verify retained report bytes, not the correctness of historical execution assumptions.',
            'Manifest row/tick counts are historical claims until raw files are restored and verified.',
            'Tar member names are inventory only; source-code archives are not market history.',
            'Source coverage is per configuration and discontinuous; global min/max is not continuous history.',
            'No strategy backtest, provider handshake, remote Supabase query or live order is performed.',
        ],
    }


if __name__ == '__main__':
    print(json.dumps(inspect(), indent=2, sort_keys=True, allow_nan=False))
