from dataclasses import replace
from datetime import datetime,timezone
import unittest
from gold_turbo.contracts import Candle
from gold_turbo.context_features import context_features,FEATURE_NAMES

class ContextFeatureTests(unittest.TestCase):
    def rows(self):
        at=int(datetime(2026,9,8,8,tzinfo=timezone.utc).timestamp()*1000)
        return [Candle('XAUUSD','test',60000,at+i*60000,2000+i*.01,2000.4+i*.01,1999.7+i*.01,2000.1+i*.01,100+i,'BROKER_COMPLETED_BAR') for i in range(40)]
    def test_only_known_contiguous_completed_m1_is_usable(self):
        r=self.rows();now=r[-1].end_ms
        self.assertIsNone(context_features(r,.1,now-1));self.assertIsNone(context_features(r,.1,now+5001))
        self.assertIsNone(context_features(r[:20]+r[21:],.1,now))
    def test_finite_shape_and_explicit_quote_cost_feature(self):
        r=self.rows();x,a=context_features(r,.1,r[-1].end_ms)
        self.assertEqual(len(x),len(FEATURE_NAMES));self.assertEqual(len(x),15);self.assertAlmostEqual(x[12],.1/a)
    def test_affine_price_scale_does_not_create_a_different_signal_state(self):
        r=self.rows();a=context_features(r,.1,r[-1].end_ms)[0]
        scaled=[replace(v,open=v.open*2,high=v.high*2,low=v.low*2,close=v.close*2) for v in r]
        b=context_features(scaled,.2,r[-1].end_ms)[0]
        for x,y in zip(a,b):self.assertAlmostEqual(x,y)
    def test_older_bars_cannot_change_fixed_window_features(self):
        r=self.rows();changed=[replace(v,open=1000.,high=3000.,low=900.,close=1000.) for v in r[:8]]+r[8:]
        self.assertEqual(context_features(r,.1,r[-1].end_ms),context_features(changed,.1,r[-1].end_ms))
    def test_zero_range_and_negative_spread_never_produce_a_model_input(self):
        r=[replace(v,open=2000.,high=2000.,low=2000.,close=2000.) for v in self.rows()]
        self.assertIsNone(context_features(r,.1,r[-1].end_ms));self.assertIsNone(context_features(self.rows(),-.1,r[-1].end_ms))

if __name__=='__main__':unittest.main()
