"""Recover Friday liquidation marks without rerunning or changing strategy/risk logic.
Native account evidence already records the actual exit-side bid/ask mark, fees and
carry at Friday. Recover that mark algebraically from equity minus cash, validating
single-position/full-quantity invariants. Complementary Gold needs paired vendor
candle closes. The attempted minute endpoint returned HTTP 429; use cached
paired original archives and retain the observed resolution without retries.
"""
import datetime,gzip,hashlib,json,lzma,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
UTC=datetime.timezone.utc
DAY=86400000

def ms(x):
    return x if isinstance(x,(int,float)) else datetime.datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()*1000

def first_friday(entry,exit):
    d=datetime.datetime.fromtimestamp(ms(entry)/1000,UTC).replace(hour=20,minute=0,second=0,microsecond=0)
    d+=datetime.timedelta(days=(4-d.weekday())%7)
    if d.timestamp()*1000<=ms(entry):d+=datetime.timedelta(days=7)
    at=int(d.timestamp()*1000)
    return at if at<ms(exit) else None

def adverse_price(reference,side,bps,tick):
    value=reference*(1-side*bps/10000)/tick
    return (math.floor(value+1e-10) if side==1 else math.ceil(value-1e-10))*tick

def native_close(t,a,setup,spec,at):
    if setup.get('management',{}).get('partialFraction',.5)!=0:
        raise ValueError('Native partial-exit evidence must be replayed explicitly')
    observations=[q for q in a['equityPath'] if at-60000<=q['at']<=at and q['kind'] in ('OBSERVED_QUOTE_MARK','CLOSED_BAR_MARK') and q.get('openPositions')==1]
    if not observations:return {'status':'MISSING_FRESH_NATIVE_MARK','at':at}
    q=max(observations,key=lambda q:(q['at'],q['kind']=='OBSERVED_QUOTE_MARK'))
    # Every admitted broker config is isolated to one symbol and holds at most one position.
    if any(v['openedAt']<at<v['closedAt'] and v['signalId']!=t['signalId'] for v in a['trades']):
        raise ValueError('Cannot isolate account cash with overlapping native positions')
    unrealized=q['equity']-q['balance'];units=t['quantity']*spec['contractSize']
    if t['symbol'] in ('USDJPY','USDCAD'):
        # Conversion uses contemporaneous bid. Use the recorded native 5m quote,
        # rather than treating JPY price differences as dollar P&L.
        dt=datetime.datetime.fromtimestamp(at/1000,UTC)
        p=ROOT/'.tmp/part1-broker'/f"{t['symbol']}-5m-{dt:%Y-%m}.json"
        rows=json.loads(p.read_text());bar=next((b for b in rows if ms(b['open_time'])==at),None)
        if bar is None:return {'status':'MISSING_NATIVE_CONVERSION_QUOTE','at':at}
        conversion=1/bar['open'];reference=bar['open'] if t['side']==1 else bar['ask_open']
        if q['at']!=at or abs((reference-t['entry'])*t['side']*units*conversion-unrealized)>1e-6:
            raise ValueError('Native quote does not reconcile to recorded equity')
    else:
        conversion=1
        reference=t['entry']+unrealized/(t['side']*units)
    closed_net=sum(v['net'] for v in a['trades'] if v['closedAt']<=q['at'])
    realized=q['balance']-a['capital']-closed_net
    # Recorded cash already includes entry commission and all carry up to Friday.
    price=adverse_price(reference,t['side'],spec['slippageBps'],spec['tickSize'])
    fee=t['quantity']*spec['commissionPerQuantityPerSide']
    risk=t['net']/t['netR']
    if not math.isfinite(risk) or risk<=0:raise ValueError('Missing positive source risk')
    net=(realized+(price-t['entry'])*t['side']*units*conversion-fee)/risk
    return {'status':'PRICED','at':at,'observedAt':q['at'],'reference':reference,'exitPrice':price,'conversion':conversion,'netR':net,'source':'RECORDED_NATIVE_EXIT_SIDE_MARK','markKind':q['kind'],'sourceCashBeforeClose':realized,'exitFee':fee,'originalRisk':risk}

def complementary_close(row,quote):
    o=row['outcome'];c=row['candidate'];at=quote['at']
    if quote['status']!='PRICED':return quote
    sign=1 if c['side']=='buy' else -1;risk=abs(o['entryPrice']-c['stop'])
    prior=[e for e in o['cashFlowEvents'] if ms(e['time'])<at]
    # Frozen source books the complete round-trip cost once, at entry.
    realized=sum(e['realizedR'] for e in prior)
    remaining=.5 if any(e['kind']=='TP1' for e in prior) else 1
    price=quote['bid' if sign==1 else 'ask']['close']
    return {**quote,'exitPrice':price,'netR':realized+remaining*sign*(price-o['entryPrice'])/risk,'remainingFraction':remaining,'sourceRealizedR':realized}

def main():
    data=json.loads((ROOT/'.tmp/part1-ledgers.json').read_text())
    reviews=json.loads((ROOT/'.tmp/part1-reviews.json').read_text())
    periods={p['reportSha256']:p for r in reviews for p in r['periods']}
    normalized={(t['strategy'],t['id']):t for t in data['trades']}
    closes=[];pending=[]
    for source in data['sources']:
        if source['strategy'].startswith('crypto'):continue
        d=json.loads(gzip.decompress((ROOT/source['path']).read_bytes()))
        if 'complementary' in source['strategy']:
            for row in d['ledger']:
                o=row.get('outcome')
                if not o or o.get('netR') is None or not o.get('exitTime'):continue
                if (o['strategyId'],o['candidateId']) not in normalized:continue
                at=first_friday(o['entryTime'],o['exitTime'])
                if at:pending.append((row,source,at))
        else:
            p=periods[source['sha256']]
            a=next(a for a in d['accounts'] if a['capital']==p['capital'] and a['riskPct']==p['riskPct'])
            setups={v['setup']['id']:v['setup'] for v in d['signalSnapshots']}
            specs={s['symbol']:s for s in d['executionAssumptions']}
            for t in a['trades']:
                at=first_friday(t['openedAt'],t['closedAt'])
                if at:
                    close=native_close(t,a,setups[t['signalId']],specs[t['symbol']],at)
                    closes.append({**close,'strategy':t['strategy'],'id':t['signalId'],'symbol':t['symbol'],'sourceReportSha256':source['sha256']})
    dates=sorted({at for _,_,at in pending})
    # Public minute endpoint returned HTTP 429. Do not retry/bypass the source.
    # Existing paired original vendor hourly archives contain the exact 19:00
    # candle close at the 20:00 boundary. Retain that resolution in the evidence.
    cache=ROOT.parent/'research-data/complementary'
    quotes={}
    for at in dates:
        d=datetime.datetime.fromtimestamp(at/1000,UTC)
        sources=[];sides=[]
        minute=all((cache/f'XAUUSD-{d:%Y-%m-%d}-{side}-1m.bi5').exists() for side in ('BID','ASK'))
        offset=19*3600+59*60 if minute else (d.day-1)*86400+19*3600
        for side in ('BID','ASK'):
            archive=cache/(f'XAUUSD-{d:%Y-%m-%d}-{side}-1m.bi5' if minute else f'XAUUSD-{d:%Y-%m}-{side}.bi5')
            raw=archive.read_bytes();payload=lzma.decompress(raw)
            if len(payload)%24:raise ValueError('Invalid vendor candle payload')
            row=next((r for r in struct.iter_unpack('>5if',payload) if r[0]==offset and r[5]>0),None)
            suffix=f'{d:%d}/{side}_candles_min_1.bi5' if minute else f'{side}_candles_hour_1.bi5'
            sources.append({'url':f'https://datafeed.dukascopy.com/datafeed/XAUUSD/{d:%Y}/{d.month-1:02d}/'+suffix,'sha256':hashlib.sha256(raw).hexdigest(),'side':side})
            sides.append(None if row is None else {'open':row[1]/1000,'close':row[2]/1000,'low':row[3]/1000,'high':row[4]/1000,'volume':row[5]})
        if any(b is None for b in sides):
            quotes[at]={'status':'NO_FRESH_VENDOR_CANDLE','at':at,'sources':sources};continue
        if any(sides[1][k]<sides[0][k] for k in ('open','high','low','close')):raise ValueError('Crossed vendor quote')
        quotes[at]={'status':'PRICED','at':at,'observedAt':at-1,'candleOpen':at-(60000 if minute else 3600000),'timeframe':'1m' if minute else '1h','source':'DUKASCOPY_BROKER_BID_ASK','bid':sides[0],'ask':sides[1],'sources':sources,'priceMeaning':'Observed vendor candle close at 20:00 UTC, not a tick fill receipt; minute endpoint returned HTTP 429; cached minute archives preferred'}
    for row,source,at in pending:
        o=row['outcome'];closes.append({**complementary_close(row,quotes[at]),'strategy':o['strategyId'],'id':o['candidateId'],'symbol':o['symbol'],'sourceReportSha256':source['sha256']})
    out={'schema':'part1-friday-close-evidence/v1','policy':'Existing Friday 20:00 UTC rotation; no strategy or risk changes','closes':closes,'limitations':['Historical reference liquidation scenarios, not provider fills','Native marks recovered from hash-verified original account equity/cash; original fee, tick, slippage and currency conversion retained','Paired vendor hourly closes retain archive hashes; closed holiday sessions are never forward-filled', 'Hourly candle close timestamps do not establish <=60s last-tick freshness; intraminute vendor access returned HTTP 429']}
    path=ROOT/'docs/research/part1-backfill/friday-closes.json';path.write_text(json.dumps(out,indent=2)+'\n')
    print('Friday records',len(closes),'priced',sum(c['status']=='PRICED' for c in closes),'unavailable',[(c['symbol'],datetime.datetime.fromtimestamp(c['at']/1000,UTC).isoformat(),c['status']) for c in closes if c['status']!='PRICED'])
if __name__=='__main__':main()
