"""Parallel original vendor archives; subprocess tool performs vendor+decoded integrity checks."""
import concurrent.futures,subprocess,pathlib
symbols=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','LTCUSDT'];months=[f'2025-{m:02}' for m in range(1,9)]+[f'2026-{m:02}' for m in range(7,11)];folder=pathlib.Path('.tmp/mission2/futures-data');folder.mkdir(parents=True,exist_ok=True)
def acquire(s):
 with (folder/(s+'.log')).open('w') as log:subprocess.run(['python3','scripts/research/acquire-canonical-history.py','--venue','usdm','--symbols',s,'--months',','.join(months),'--out',str(folder)],stdout=log,stderr=subprocess.STDOUT,check=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(acquire,symbols))
print('120 native futures archives acquired and checksum-verified',flush=True)
