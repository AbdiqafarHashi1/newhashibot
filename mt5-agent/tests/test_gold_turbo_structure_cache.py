"""Cache changes computation frequency, never structure evidence."""
from dataclasses import replace
import math
import unittest
from unittest.mock import patch
from gold_turbo import MarketIntelligence,Tick,Candle
from gold_turbo.features import structure

BASE=1800000000000
class StructureCacheTests(unittest.TestCase):
    def test_cached_structure_equals_uncached_through_ticks_closes_and_repair(self):
        e=MarketIntelligence('XAUUSD','cache-test')
        rows=[Candle('XAUUSD','cache-test',tf,BASE-(60-i)*tf,2000.,2001.+.1*math.sin(i),1999.-.1*math.cos(i),2000.+.1*math.sin(i),100,'BROKER_COMPLETED_BAR') for tf in (60000,300000,900000) for i in range(60)]
        e.seed_completed(rows,BASE)
        with patch('gold_turbo.intelligence.structure',wraps=structure) as count:
            for i in range(181):
                at=BASE+i*1000;bid=2000+.3*math.sin(i/3)
                e.ingest(Tick('XAUUSD','cache-test',at,bid,bid+.02),at)
                s=e.snapshot(at)
                if i==9:self.assertEqual(count.call_count,3)
                if i==120:
                    last=s.frames[0].completed[-1]
                    e.refresh_completed([replace(last,high=2002.,low=1998.,close=2000.,origin='BROKER_COMPLETED_BAR')],at)
                    s=e.snapshot(at)
                for f in s.frames:
                    active=f.developing if f.developing and f.developing.usable else None
                    self.assertEqual(f.structure,structure(f.usable_completed,active,f.indicators.atr14,.01))
            self.assertLess(count.call_count,20)

if __name__=='__main__':unittest.main()
