import dataclasses
import datetime as dt
import unittest

import numpy as np

import hashibot_strategies as h

T = dt.datetime(2026, 1, 5, 8, tzinfo=dt.timezone.utc).timestamp()


def candles(n=60, seconds=300, end=T, price=100.):
    close = np.full(n, price)
    return np.column_stack([np.arange(n) * seconds + end - n * seconds,
                            close, close + price * .001, close - price * .001,
                            close, np.full(n, 100.), np.full(n, 50.)])


def hourly(end=T, down=False):
    end = end // 3600 * 3600
    a = candles(60, 3600, end)
    close = 100 + np.arange(60) * (-.1 if down else .1) + np.sin(np.arange(60) * np.pi / 4) * .5
    a[:, 1:5] = np.column_stack([close, close + .1, close - .1, close])
    return a


def context(**kw):
    end = kw.get('asof', T)
    default = dict(ticker='BTCUSDT', market='CRYPTO', bars=candles(end=end), h1=hourly(end),
                   asof=end, source='TEST_NATIVE', funding=h.Funding(0., end, 'TEST_FUNDING'))
    default.update(kw)
    return h.SignalContext(**default)


class Always(h.SignalStrategy):
    def setup(self, ctx, a):
        return h.Setup('BUY', float(a[-1, 4]), .5, 'TEST')


def evaluation(action='BUY', kind='NEXT_OPEN', strategy='TEST', market='CRYPTO'):
    sign = 1 if action == 'BUY' else -1
    payload = dict(ticker='BTCUSDT', strategy=strategy, action=action, entry=100.,
                   sl=100-sign*2, tp=100+sign*4, signal_intensity=.5, regime='TEST')
    return h.Evaluation(payload, (), T, 300, 1., market, kind)


def bar(i=0, open=100., high=100.2, low=99.8, close=100.):
    return np.array([T+i*300, open, high, low, close, 100., 50.])


class FrameworkTest(unittest.TestCase):
    def test_atr_wilder_and_strict_payload(self):
        c = context()
        self.assertAlmostEqual(h.atr14(c.bars), .2)
        result = Always().evaluate(c)
        self.assertEqual(set(result.payload), h.PAYLOAD_KEYS)
        self.assertAlmostEqual(result.payload['entry']-result.payload['sl'], .4)
        self.assertAlmostEqual(result.payload['tp']-result.payload['entry'], .8)
        self.assertEqual(h.h1_structure(c.h1), 'UP')
        news = h.NewsCalendar((), T, T-7200, T+7200, 'TEST')
        fx = Always().evaluate(context(market='FOREX', currencies=('EUR','USD'), news=news))
        self.assertAlmostEqual(fx.payload['entry']-fx.payload['sl'], .3)
        self.assertAlmostEqual(fx.payload['tp']-fx.payload['entry'], .6)

    def test_news_exact_window_and_coverage(self):
        for offset in (-3600, 0, 3600):
            n = h.NewsCalendar(((T+offset, ('USD',), 'HIGH'),), T, T-7200, T+7200, 'TEST')
            r = Always().evaluate(context(market='FOREX', currencies=('EUR','USD'), news=n))
            self.assertIn('HIGH_IMPACT_NEWS_LOCKOUT', r.reasons)
        self.assertIsNone(Always().generate(context(market='FOREX')))
        n = h.NewsCalendar((), T-90000, T-7200, T+7200, 'TEST')
        self.assertIsNone(Always().generate(context(market='FOREX', currencies=('USD',), news=n)))

    def test_funding_and_hourly_gate(self):
        for f in (None, h.Funding(.001, T, 'TEST'), h.Funding(0, T+1, 'TEST'),
                  h.Funding(0, T-1801, 'TEST'), h.Funding(float('nan'), T, 'TEST'),
                  h.Funding(0, T, 'TEST', 4)):
            self.assertIsNone(Always().generate(context(funding=f)))
        self.assertIsNotNone(Always().generate(context(instrument='SPOT', funding=None)))
        self.assertIsNone(Always().generate(context(h1=hourly(down=True))))
        self.assertIsNone(Always().generate(context(h1=candles(60,3600))))

    def test_data_quality_and_late_evaluation(self):
        a = candles(); a[3,0] = a[2,0]
        self.assertIsNone(Always().generate(context(bars=a)))
        self.assertIsNone(Always().generate(context(asof=T+1, bars=candles(end=T))))
        a = candles(); a[-1,3] = -1
        self.assertIsNone(Always().generate(context(bars=a)))

    def test_session_sweep_and_dst(self):
        end = T+300
        a = candles(97, end=end, price=1.0904)
        a[:,2:4] = [1.0905,1.0903]
        a[0,2:4] = [1.11,1.09]
        a[-1,1:5] = [1.0904,1.0905,1.0897,1.0902]
        n = h.NewsCalendar((), end, end-7200, end+7200, 'TEST')
        c = context(ticker='EURUSD', market='FOREX', bars=a, asof=end, pip_size=.0001,
                    currencies=('EUR','USD'), news=n)
        r = h.SessionLiquiditySweep().evaluate(c)
        self.assertIsNotNone(r.payload, r.reasons)
        self.assertEqual(r.payload['action'],'BUY')
        self.assertIsNone(h.SessionLiquiditySweep().generate(dataclasses.replace(c,pip_size=None)))
        # London 08:00 winter and summer map to different UTC hours.
        from zoneinfo import ZoneInfo
        self.assertEqual(dt.datetime(2026,7,1,7,tzinfo=dt.timezone.utc).astimezone(ZoneInfo('Europe/London')).hour,8)

    def test_native_cvd_divergence_both_directions(self):
        a = candles(40); a[:,6] = 55; a[29,3] = 98; a[37,3] = 97
        r = h.CVDDivergenceEngine().evaluate(context(bars=a))
        self.assertIsNotNone(r.payload, r.reasons)
        self.assertEqual(r.payload['action'],'BUY')
        self.assertIsNone(h.CVDDivergenceEngine().generate(context(bars=a[:,:6])))
        a = candles(40); a[:,6] = 45; a[29,2] = 102; a[37,2] = 103
        r = h.CVDDivergenceEngine().evaluate(context(bars=a,h1=hourly(down=True)))
        self.assertEqual(r.payload['action'],'SELL')

    def test_quiet_exhaustion(self):
        end = T+13*3600
        a = candles(60,end=end); closes=100+np.sin(np.arange(60))*.1
        a[:,1:5] = np.column_stack([closes,closes+.1,closes-.1,closes])
        a[-1,1:5] = [98.5,98.6,98.3,98.4]; a[-1,5] = 10
        r = h.MeanReversionExhaustion().evaluate(context(bars=a,asof=end))
        self.assertIsNotNone(r.payload,r.reasons)
        self.assertEqual(r.payload['action'],'BUY')

    def test_h4_ote_is_unfilled_limit(self):
        a = candles(40,14400,T)
        closes=100+np.sin(np.arange(40)*np.pi/4)
        a[:,1:5]=np.column_stack([closes,closes+.1,closes-.1,closes])
        a[-1,1:5]=[100,125,99.9,124]
        r=h.H4MarketStructureShift().evaluate(context(h4=a))
        self.assertIsNotNone(r.payload,r.reasons)
        self.assertEqual(r.entry_kind,'LIMIT')
        self.assertEqual(r.seconds,14400)
        lo=float(a[h.pivots(a[:-1],3)[-1],3]); span=125-lo
        self.assertTrue(125-.786*span <= r.payload['entry'] <=125-.618*span)

    def test_measured_profile_gap(self):
        a=candles(); a[:,1:5]=[96.9,97.,96.8,96.9]
        a[-1,1:6]=[96.9,97.6,96.8,97.5,200]
        bins=np.array([[95,96,10],[96,97,30],[97,98,1],[98,99,1],[99,100,30],[100,101,10],[101,102,10]],float)
        p=h.VolumeProfile(bins,T-86400,T-300,T,'TEST_TRADES',True)
        r=h.VolumeProfileGapRider().evaluate(context(bars=a,profile=p))
        self.assertIsNotNone(r.payload,r.reasons)
        self.assertIsNone(h.VolumeProfileGapRider().generate(context(bars=a)))
        self.assertIsNone(h.VolumeProfileGapRider().generate(context(bars=a,profile=dataclasses.replace(p,actual_traded_volume=False))))

    def test_temporal_exit_idempotency_and_gap(self):
        tracker=h.VirtualSignalTracker(); key=tracker.register(evaluation())
        self.assertEqual(key,tracker.register(evaluation()))
        for i in range(11):
            self.assertIsNone(tracker.update(key,bar(i),T+(i+1)*300))
        event=tracker.update(key,bar(11),T+12*300)
        self.assertEqual(event['reason'],'TIME_STOP');self.assertEqual(event['bars'],12)
        self.assertIsNone(tracker.update(key,bar(11),T+12*300))
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation())
        with self.assertRaises(ValueError):tracker.update(key,bar(1),T+600)

    def test_stop_first_and_no_retroactive_trailing(self):
        for action in ('BUY','SELL'):
            tracker=h.VirtualSignalTracker();key=tracker.register(evaluation(action))
            e=tracker.update(key,bar(high=105,low=95),T+300)
            self.assertEqual(e['reason'],'STOP')
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation())
        self.assertIsNone(tracker.update(key,bar(high=103.5,low=98.5,close=103),T+300))
        self.assertEqual(tracker.signals[key]['stop'],99.)
        e=tracker.update(key,bar(1,open=103,high=103,low=98.5,close=100),T+600)
        self.assertEqual(e['exit'],99.)

    def test_limit_expiry_and_ambiguous_fill_bar(self):
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation(kind='LIMIT'))
        for i in range(12):event=tracker.update(key,bar(i,open=102,high=103,low=101,close=102),T+(i+1)*300)
        self.assertEqual(event['reason'],'LIMIT_EXPIRED')
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation(kind='LIMIT'))
        self.assertIsNone(tracker.update(key,bar(open=101,high=105,low=99.5,close=100.5),T+300))
        self.assertEqual(tracker.update(key,bar(1,open=101,high=105,low=100,close=104),T+600)['reason'],'TARGET')

    def test_gap_cancellation_and_conflicting_retry(self):
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation())
        self.assertEqual(tracker.update(key,bar(open=96,high=97,low=95,close=96),T+300)['reason'],'ENTRY_GAP_INVALID')
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation())
        tracker.update(key,bar(),T+300)
        with self.assertRaises(ValueError):tracker.update(key,bar(close=100.1),T+300)

    def test_cvd_exit_is_connected_and_pf_not_fabricated(self):
        a=candles(32,end=T+300);a[:,6]=100;a[-3:,6]=50
        self.assertTrue(h.cvd_momentum_flat(a))
        tracker=h.VirtualSignalTracker();key=tracker.register(evaluation(strategy='CVDDivergenceEngine'))
        self.assertEqual(tracker.update_context(key,context(bars=a,asof=T+300))['reason'],'CVD_FLAT')
        self.assertAlmostEqual(h.profit_factor([2.,-1.,-.5]),4/3)
        self.assertIsNone(h.profit_factor([2.,1.]))
        with self.assertRaises(ValueError):h.profit_factor([float('nan')])

    def test_rolling_net_pf_is_measured_and_never_release_authority(self):
        rows=[(str(i),T+i,2. if i%2 else -1.) for i in range(40)]
        r=h.rolling_profit_factor(rows,T+40,30,30)
        self.assertEqual(r['profit_factor'],2.);self.assertTrue(r['above_threshold'])
        self.assertFalse(r['release_approved'])
        self.assertEqual(h.rolling_profit_factor(rows,T+10,30,30)['reason'],'INSUFFICIENT_SAMPLE')
        self.assertEqual(h.rolling_profit_factor([(str(i),T+i,1.) for i in range(30)],T+40,30,30)['reason'],'UNDEFINED_NO_LOSSES')
        equal=[(str(i),T+i,1. if i%2 else -1.) for i in range(30)]
        self.assertFalse(h.rolling_profit_factor(equal,T+40,30,30)['above_threshold'])
        with self.assertRaises(ValueError):h.rolling_profit_factor([('x',T,1.),('x',T,-1.)],T+1,30,30)

    def test_broker_h4_utc_phase_is_preserved(self):
        a=candles(40,14400,T+7200)
        h.admit(a,14400,T+7200)
        e=dataclasses.replace(evaluation(),asof=T+7200,seconds=14400)
        tracker=h.VirtualSignalTracker();key=tracker.register(e)
        b=bar();b[0]=T+7200
        self.assertIsNone(tracker.update(key,b,T+7200+14400))


if __name__ == '__main__':
    unittest.main()
