import {readFile,mkdir,writeFile} from 'node:fs/promises';
const files=process.argv.slice(2);if(files.length!==2)throw Error('Provide crypto and forex evaluate.ts reports');
await mkdir('docs/research/cost-aware',{recursive:true});
for(const file of files){const report=JSON.parse(await readFile(file,'utf8'));
 if(report.schema!=='cost-aware-walk-forward/v1'||!['crypto','forex'].includes(report.market)||report.publication!==false||report.execution!==false||report.promotion!==false)throw Error('INVALID_RESEARCH_REPORT');
 // Generated audit evidence: retain every model, source hash, forecast, arbitration and cash flow.
 await writeFile(`docs/research/cost-aware/${report.market}-development.json`,JSON.stringify(report)+'\n');
 console.log(JSON.stringify({market:report.market,verdict:report.verdict,trials:report.trials.map((t:{alpha:number;metrics:{resolvedCount:number;profitFactor:number|null};reasons:string[]})=>({alpha:t.alpha,trades:t.metrics.resolvedCount,netProfitFactor:t.metrics.profitFactor,reasons:t.reasons}))}));
}
