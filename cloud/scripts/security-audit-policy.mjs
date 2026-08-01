import fs from "node:fs";
const [reportPath,policyPath,today]=process.argv.slice(2);const report=JSON.parse(fs.readFileSync(reportPath,"utf8"));const policy=JSON.parse(fs.readFileSync(policyPath,"utf8"));
const approved=new Map(policy.exceptions.map(x=>[`${x.package}:${x.advisory_id}`,x]));let rejected=0, critical=0;
for(const [pkg,v] of Object.entries(report.vulnerabilities||{}))for(const finding of (Array.isArray(v.via)?v.via:[]).filter(x=>typeof x==="object")){
 if(!["high","critical"].includes(finding.severity))continue; const id=(finding.url||"").split("/").pop()||String(finding.source); const exception=approved.get(`${pkg}:${id}`);
 if(finding.severity==="critical"){critical++;console.error(`REJECT critical ${pkg} ${id}`);continue;}
 if(!exception||exception.severity!==finding.severity||exception.affected_range!==finding.range||exception.expiry_date<today||!exception.justification||!exception.owner){rejected++;console.error(`REJECT unapproved high ${pkg} ${id}`);}else console.log(`APPROVED TEMPORARY EXCEPTION ${pkg} ${id} expires ${exception.expiry_date}: ${exception.justification}`);
}
if(critical||rejected){console.error(`Security gate failed: critical=${critical} unapproved_high=${rejected}`);process.exit(1);}console.log("Security gate passed: no critical or unapproved high production vulnerabilities.");
