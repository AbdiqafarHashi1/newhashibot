import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import crypto from 'node:crypto';
const walk=(root)=>fs.readdirSync(root,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(root,d.name)):[path.join(root,d.name)]);
const files=[...walk('src/pages/admin'),...walk('src/components/operations')].filter(p=>p.endsWith('.tsx'));
const findings=files.map(file=>{
 const content=fs.readFileSync(file,'utf8'),source=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),labels=[],backend=[],mutations=[];
 function visit(node){
  if(ts.isJsxText(node)&&/\b(?:Phase[- ]+[A-Z]|Prompt +\d+)/.test(node.text))labels.push({line:source.getLineAndCharacterOfPosition(node.pos).line+1,text:node.text.trim()});
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)){
   const method=node.expression.name.text,code=node.getText(source);
   if(['from','rpc','invoke'].includes(method))backend.push({method,target:node.arguments[0]?.getText(source)??'dynamic'});
   if(['insert','update','upsert','delete'].includes(method)&&code.includes('.from('))mutations.push({line:source.getLineAndCharacterOfPosition(node.pos).line+1,code:code.slice(0,240)});
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
 return {file,sourceHash:crypto.createHash('sha256').update(content).digest('hex'),internalUiLabels:labels,backendReferences:backend,directMutationEdges:mutations,verification:'STATIC_SOURCE_INVENTORY_NOT_RUNTIME_CERTIFICATION'};
});
const app=fs.readFileSync('src/App.tsx','utf8');
const routes=[...app.matchAll(/<Route\s+path="(\/admin[^\"]*)"\s+element=\{([^\n]+)/g)].map(m=>({route:m[1],element:m[2].split('/>')[0].slice(0,200)}));
const report={baseCommit:'de55838aed5b2ace36098022b9032b3aef683403',scope:'All available admin page and operations component source; static inventory, not proof of server permission or genuine provider behavior.',routeCount:routes.length,surfaceCount:findings.length,routes,surfaces:findings};
fs.mkdirSync('docs/operations',{recursive:true});fs.writeFileSync('docs/operations/admin-surface-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({routes:routes.length,surfaces:findings.length,internalUiLabels:findings.flatMap(x=>x.internalUiLabels.map(v=>({file:x.file,...v}))),mutationSurfaces:findings.filter(x=>x.directMutationEdges.length).map(x=>({file:x.file,edges:x.directMutationEdges.length}))},null,2));
if(process.argv.includes('--check')&&findings.some(x=>x.internalUiLabels.length))process.exitCode=1;
