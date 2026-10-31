import importlib.util
import pathlib
import unittest
import contextlib, io, json, os, tempfile
from unittest.mock import patch
import numpy as np

spec=importlib.util.spec_from_file_location('spot_swing','scripts/research/spot-swing-study.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DAY=86400000
def fixture(n=400):
    close=100+np.arange(n)*2
    return np.column_stack([np.arange(n)*DAY,close-1,close+1,close-1,close,np.full(n,100)])

class SwingTests(unittest.TestCase):
    def test_known_indicators(self):
        self.assertTrue(np.allclose(m.ema(np.array([100.,102.,104.]),3),[100,101,102.5]))
        a=fixture(20);a[:,1:5]=[100,101,99,100]
        self.assertTrue(np.allclose(m.atr14(a)[14:],2))

    def test_long_swing_stage_accounting_and_future_invariance(self):
        a=fixture()
        for mode in ['CHANNEL20_10_TREND','EMA20_50_REGIME']:
            r=m.simulate(a,mode,200*DAY,300*DAY)
            self.assertGreater(len(r),0);self.assertGreater(r[-1]['bars'],12)
            self.assertEqual(r[-1]['reason'],'DECLARED_STAGE_END_LIQUIDATION')
            for t in r:
                self.assertLess(t['signalAt'],t['entryAt']+1)
                self.assertAlmostEqual(t['netReturn'],t['exit']/t['entry']-1-.0026)
                self.assertAlmostEqual(t['stressReturn'],t['grossReturn']-.0039)
            future=a.copy();future[300:,1:5]*=10
            self.assertEqual(r,m.simulate(future,mode,200*DAY,300*DAY))

    def test_gap_stop_and_no_same_day_reentry(self):
        a=fixture();a[250,1:5]=[100,101,99,100]
        for mode in ['CHANNEL20_10_TREND','EMA20_50_REGIME']:
            r=m.simulate(a,mode,200*DAY,300*DAY)
            stop=next(t for t in r if t['exitBarOpen']==250*DAY)
            self.assertEqual(stop['exit'],100)
            for t in r[1:]:self.assertGreater(t['entryAt'],r[0]['exitBarOpen'])

    def test_failed_development_blocks_later_acquisition(self):
        protocol=pathlib.Path('scripts/research/spot-swing-protocol.json').read_bytes()
        code=pathlib.Path('scripts/research/spot-swing-study.py').read_bytes();cwd=os.getcwd();calls=[]
        def fetch(root,symbol,stage,sources):
            calls.append(stage['name']);a=fixture();a[:,1:5]=[100,101,99,100];return a
        with tempfile.TemporaryDirectory() as temp:
            try:
                os.chdir(temp);folder=pathlib.Path('scripts/research');folder.mkdir(parents=True)
                (folder/'spot-swing-protocol.json').write_bytes(protocol);(folder/'spot-swing-study.py').write_bytes(code)
                with patch.object(m,'fetch_stage',fetch),contextlib.redirect_stdout(io.StringIO()):m.run(pathlib.Path('cache'))
                self.assertEqual(calls,['DEVELOPMENT','DEVELOPMENT'])
                report=json.loads(pathlib.Path('docs/research/spot-swing/summary.json').read_text())
                self.assertEqual(report['results'][1]['status'],'BLOCKED_PREVIOUS_STAGE')
            finally:os.chdir(cwd)

    def test_trail_is_not_applied_retroactively_inside_its_creation_bar(self):
        a=fixture();a[250,1:5]=[599,631,590,630]
        for mode in ['CHANNEL20_10_TREND','EMA20_50_REGIME']:
            trades=m.simulate(a,mode,200*DAY,300*DAY)
            self.assertFalse(any(t['exitBarOpen']==250*DAY for t in trades))
            next_exit=next(t for t in trades if t['exitBarOpen']==251*DAY)
            self.assertEqual(next_exit['exit'],601.)

    def test_nonstandard_native_close_is_excluded_only_before_warmup(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp);start=m.epoch('2018-01-01');raw=[]
            for i in range(3):raw.append([start+i*DAY,'100','101','99','100','10',start+(i+1)*DAY-1])
            raw[1][6]=start+DAY+1000
            (root/'BTCUSDT-DEVELOPMENT-0.json').write_text(json.dumps(raw));sources=[]
            a=m.fetch_stage(root,'BTCUSDT',dict(name='DEVELOPMENT',**{'from':'2018-01-01','until':'2018-01-04'}),sources)
            self.assertEqual(len(a),1);self.assertEqual(a[0,0],start+2*DAY)
            self.assertEqual(sources[0]['warmupResetAfter'],start+2*DAY)
            (root/'BTCUSDT-VALIDATION-0.json').write_text(json.dumps(raw))
            with self.assertRaises(ValueError):m.fetch_stage(root,'BTCUSDT',dict(name='VALIDATION',**{'from':'2018-01-01','until':'2018-01-04'}),[])

if __name__=='__main__':unittest.main()
