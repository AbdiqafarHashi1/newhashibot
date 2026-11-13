import {readFileSync,writeFileSync} from 'node:fs';
const [out,...paths]=process.argv.slice(2);if(!out||paths.length<2)throw Error('OUTPUT_AND_SHARDS_REQUIRED');
const reports=paths.map(p=>JSON.parse(readFileSync(p,'utf8'))),first=reports[0];
for(const r of reports)for(const key of ['schema','sourceReportSha256','engineSourceSha256','profile','period','strategyScope','signalCount','protocol','productionAuthorization'])if(JSON.stringify(r[key])!==JSON.stringify(first[key]))throw Error('PROP_SHARD_IDENTITY_MISMATCH:'+key);
const results=reports.flatMap(r=>r.results),keys=results.map(r=>JSON.stringify([r.bundleId,r.maximumPositions,r.initialPhase,r.capital,r.costScale,r.riskPct,r.start]));if(new Set(keys).size!==keys.length)throw Error('DUPLICATE_PROP_COHORT');
const summary=reports.flatMap(r=>r.summary);if(summary.reduce((n,r)=>n+r.cohorts,0)!==results.length)throw Error('INCOMPLETE_PROP_SHARD');
writeFileSync(out,JSON.stringify({...first,summary,results},null,2)+'\n');console.log(JSON.stringify({shards:paths.length,cohorts:results.length,summaryRows:summary.length}));
