"""Build training-only barrier labels; never fit on validation/test outcomes."""
import ctypes,hashlib,subprocess,zipfile
from pathlib import Path
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[3]

def execution_labels(data,train_mask):
    months=set(pd.to_datetime(data.t[train_mask],unit='ms',utc=True).strftime('%Y-%m'))
    if len(months)!=1:raise ValueError('ONE_TRAINING_MONTH_REQUIRED')
    month=next(iter(months));manifest=next(m for m in data.manifests if m['month']==month);archive=ROOT/f'.tmp/gold-micro/data/XAUUSD-{month}.zip'
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=manifest['archiveSha256']:raise ValueError('TICK_SOURCE_CHANGED')
    count=manifest['ticks'];t=np.empty(count);bid=np.empty(count);ask=np.empty(count);offset=0
    with zipfile.ZipFile(archive) as z:
        member=next(v for v in z.namelist() if v.lower().endswith('.csv'))
        for c in pd.read_csv(z.open(member),usecols=['Timestamp','Bid','Ask'],chunksize=250000):
            n=len(c);t[offset:offset+n]=pd.to_datetime(c.Timestamp,utc=True,format='mixed').astype('int64').to_numpy()//1000000
            bid[offset:offset+n]=c.Bid.to_numpy();ask[offset:offset+n]=c.Ask.to_numpy();offset+=n
    if offset!=count or np.any(np.diff(t)<0):raise ValueError('TICK_ORDER_OR_COUNT')
    src=Path(__file__).with_suffix('.cpp');so=ROOT/'.tmp/gold-simple'/('labels-'+hashlib.sha256(src.read_bytes()).hexdigest()[:12]+'.so')
    if not so.exists():subprocess.run(['g++','-O3','-std=c++17','-shared','-fPIC',str(src),'-o',str(so)],check=True)
    lib=ctypes.CDLL(str(so));D=ctypes.POINTER(ctypes.c_double);lib.barrier_labels.argtypes=[ctypes.c_int,D,D,D,ctypes.c_int,D,D,D,D]
    at=np.ascontiguousarray(data.t+60000);ref=np.ascontiguousarray(data.f.close.to_numpy());atr=np.ascontiguousarray(np.where(train_mask,data.av,np.nan));out=np.full((len(data.t),2),np.nan)
    ptr=lambda a:a.ctypes.data_as(D)
    lib.barrier_labels(count,ptr(t),ptr(bid),ptr(ask),len(at),ptr(at),ptr(ref),ptr(atr),ptr(out))
    return out
