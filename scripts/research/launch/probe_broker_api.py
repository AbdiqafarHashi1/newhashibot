"""One honest request to the current first-party export API. Never bypass a WAF challenge."""
import json,pathlib,urllib.request,urllib.error
url='https://jetta.dukascopy.com/v1/candles/minute/EURUSD/BID/2025/1/20';out=pathlib.Path('.tmp/launch-research/broker-data');out.mkdir(parents=True,exist_ok=True)
try:
 request=urllib.request.Request(url,headers={'User-Agent':'HashiBot-research/1.0','Accept':'application/json'})
 with urllib.request.urlopen(request,timeout=25) as response:
  raw=response.read();status=response.status;challenge=response.headers.get('x-amzn-waf-action')
  if status==202 or challenge:raise RuntimeError('PROVIDER_WAF_CHALLENGE: no bypass attempted')
  body=json.loads(raw);(out/'current-api-probe.json').write_bytes(raw);report={'url':url,'status':status,'keys':list(body),'rows':len(body.get('times',[]))}
except urllib.error.HTTPError as e:report={'url':url,'status':e.code,'retryAfter':e.headers.get('Retry-After'),'error':'Provider request rejected; no bypass attempted'}
except Exception as e:report={'url':url,'error':type(e).__name__+':'+str(e)}
(out/'current-api-health.json').write_text(json.dumps(report));print(json.dumps(report))
