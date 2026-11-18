import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const [input]=process.argv.slice(2);if(!input)throw Error('PROP_CAMPAIGN_PATH_REQUIRED');
const bytes=readFileSync(input),report=JSON.parse(bytes.toString());if(report.schema!=='prop-campaign/v1'||!report.summary.length||!report.results.length)throw Error('COMPLETE_PROP_REPORT_REQUIRED');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),summary={...report,results:undefined,fullReportSha256:hash(bytes)};
mkdirSync('public/research',{recursive:true});mkdirSync('docs/research/prop-20261113',{recursive:true});
writeFileSync('public/research/prop-ftmo-swing-20261113.summary.json',JSON.stringify(summary,null,2)+'\n');
writeFileSync('docs/research/prop-20261113/cohorts.json.gz',gzipSync(bytes,{level:9}));
writeFileSync('docs/research/prop-20261113/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({cohorts:report.results.length,summaryRows:report.summary.length,reportSha256:hash(bytes)}));
