"""Observed-quote cost/path and tick-prefix invariants; no profitability assertions."""
import ctypes,hashlib,subprocess,unittest
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
D=ctypes.POINTER(ctypes.c_double)
def ptr(a):return a.ctypes.data_as(D)
def library(name):
    src=HERE/name;so=ROOT/'.tmp/gold-simple'/('test-'+hashlib.sha256(src.read_bytes()).hexdigest()[:12]+'.so')
    if not so.exists():subprocess.run(['g++','-O2','-std=c++17','-shared','-fPIC',str(src),'-o',str(so)],check=True)
    return ctypes.CDLL(str(so))

class LabelTests(unittest.TestCase):
    def labels(self,bid,ask,atr=1.):
        lib=library('context_labels.cpp');lib.barrier_labels.argtypes=[ctypes.c_int,D,D,D,ctypes.c_int,D,D,D,D]
        t=np.array([1000000.,1000200.,1000400.]);b=np.array(bid,dtype=float);a=np.array(ask,dtype=float);at=np.array([1000000.]);ref=np.array([100.]);av=np.array([atr]);out=np.full((1,2),np.nan)
        lib.barrier_labels(3,ptr(t),ptr(b),ptr(a),1,ptr(at),ptr(ref),ptr(av),ptr(out));return out[0]
    def test_real_ask_entry_and_bid_target_and_both_fees(self):
        long,short=self.labels([100,100,102],[100.1,100.1,102.1])
        self.assertAlmostEqual(long,((101.98-100.12)-.07)/1.12)
        self.assertAlmostEqual(short,((99.98-102.12)-.07)/1.02)
    def test_gap_stop_is_not_filled_at_requested_stop(self):
        long,_=self.labels([100,100,98],[100.1,100.1,98.1])
        self.assertLess(long,-1.)
    def test_ineligible_cost_geometry_and_nontraining_rows_have_no_labels(self):
        self.assertTrue(np.isnan(self.labels([100,100,102],[100.8,100.8,102.8])).all())
        self.assertTrue(np.isnan(self.labels([100,100,102],[100.1,100.1,102.1],atr=float('nan'))).all())
    def test_tick_features_are_prefix_invariant_and_october_has_no_labels(self):
        lib=library('tick_context.cpp');lib.build_context.argtypes=[ctypes.c_int,D,D,D,ctypes.c_int,D,D,D,D,ctypes.c_bool];lib.build_context.restype=ctypes.c_void_p;lib.context_count.argtypes=[ctypes.c_void_p];lib.context_copy.argtypes=[ctypes.c_void_p,D,D,D,D,D];lib.context_destroy.argtypes=[ctypes.c_void_p]
        base=1791273600000.;t=np.arange(base,base+120001,100.);bid=2000+np.sin(np.arange(len(t))/50)*.01;ask=bid+.02
        mt=np.array([base-60000,base+60000]);mx=np.vstack([np.zeros(15),np.ones(15)*10000]);av=np.ones(2);close=np.array([2000.,2000.])
        def build(t,b,a):
            h=lib.build_context(len(t),ptr(t),ptr(b),ptr(a),2,ptr(mt),ptr(mx),ptr(av),ptr(close),False);n=lib.context_count(h);out=[np.empty(n),np.empty((n,28)),np.empty(n),np.empty(n),np.empty((n,2))];lib.context_copy(h,*[ptr(v) for v in out]);lib.context_destroy(h);return out
        prefix=build(t[:901].copy(),bid[:901].copy(),ask[:901].copy());full=build(t,bid,ask);mask=full[0]<=prefix[0][-1]
        np.testing.assert_array_equal(prefix[0],full[0][mask]);np.testing.assert_allclose(prefix[1],full[1][mask]);self.assertTrue(np.isnan(full[4]).all())

if __name__=='__main__':unittest.main()
