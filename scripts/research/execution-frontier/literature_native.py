"""Ordered-quote check of frozen literature adaptation; no performance promotion."""
import ctypes,hashlib,json,pathlib,subprocess
import tick_verify as t
from literature import LiteratureData
from features import Data
from study import OUT,D,B,dump,ptr

def setup(name):
 source=pathlib.Path(__file__).with_name(name);so=OUT/f'{name}-{hashlib.sha256(source.read_bytes()).hexdigest()[:12]}.so'
 if not so.exists():subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(source),'-o',str(so)],check=True)
 lib=ctypes.CDLL(str(so));lib.create.argtypes=[ctypes.c_int,D,B,D,D,ctypes.c_int,D];lib.create.restype=ctypes.c_void_p;lib.feed.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,D];lib.feed.restype=ctypes.c_int;lib.summary.argtypes=[ctypes.c_void_p,ctypes.c_int,D,D,ctypes.c_int];lib.summary.restype=ctypes.c_int;lib.destroy.argtypes=[ctypes.c_void_p];t.lib=lib
if __name__=='__main__':
 import sys
 stage=sys.argv[1];frozen=json.loads((OUT/f'{stage}-frozen.json').read_text());setup('swing-ticks.cpp' if stage=='swing' else 'literature-ticks.cpp');arms=json.loads((OUT/'tick-protocol.json').read_text())['arms'];results=[]
 for c in frozen['selected']:
  data=(Data if stage=='swing' else LiteratureData)(c['symbol'],frozen['protocol']['months']);periods=[]
  for month in frozen['protocol']['months']:
   r=t.run(data,c['config'],month,arms);periods.append(r);print('NATIVE',stage,c['symbol'],c['config']['family'],month,[(x['arm']['profile'],round(x['returnPct'],3)) for x in r['results'] if x['arm']['capital']==25000 and x['arm']['stress']==1.5 and x['arm']['delayMs']==3000],flush=True)
  results.append(dict(candidate=c,results=periods,manifests=data.manifests));dump(OUT/f'{stage}-native.partial.json.gz',results)
 dump(OUT/f'{stage}-native.json.gz',dict(frozen=frozen,results=results));print('COMPLETE',len(results),flush=True)
