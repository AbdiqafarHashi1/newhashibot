import {createHash} from 'node:crypto';
export const hash=value=>createHash('sha256').update(value).digest('hex');
// Lex comments, quoted identifiers, strings and dollar bodies before splitting.
// This is a source inventory, not a PostgreSQL semantic validator. Dynamic SQL
// and conditional DDL are explicitly candidates until a catalog rehearsal.
export function lex(sql){
 const tokens=[];let i=0,line=1;
 const add=(kind,start,startLine)=>tokens.push({kind,text:sql.slice(start,i),line:startLine,start,end:i});
 while(i<sql.length){
  const start=i,startLine=line,c=sql[i];
  if(/\s/.test(c)){if(c==='\n')line++;i++;continue;}
  if(sql.startsWith('--',i)){while(i<sql.length&&sql[i]!=='\n')i++;continue;}
  if(sql.startsWith('/*',i)){i+=2;let depth=1;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else{if(sql[i]==='\n')line++;i++;}}if(depth)throw Error('UNTERMINATED_SQL_COMMENT');continue;}
  if(c==="'"||c==='"'){i++;let closed=false;while(i<sql.length){if(sql[i]==='\n')line++;if(sql[i]===c){i++;if(sql[i]===c){i++;continue;}closed=true;break;}i++;}if(!closed)throw Error('UNTERMINATED_SQL_QUOTE');add(c==="'"?'string':'identifier',start,startLine);continue;}
  const dollar=c==='$'?/^\$(?:[A-Za-z_][\w]*)?\$/.exec(sql.slice(i)):null;
  if(dollar){const end=sql.indexOf(dollar[0],i+dollar[0].length);if(end<0)throw Error('UNTERMINATED_SQL_BODY');i=end+dollar[0].length;line+=(sql.slice(start,i).match(/\n/g)??[]).length;add('body',start,startLine);continue;}
  if(/[A-Za-z_]/.test(c)){i++;while(i<sql.length&&/[\w$]/.test(sql[i]))i++;add('word',start,startLine);continue;}
  if(/[0-9]/.test(c)){i++;while(i<sql.length&&/[0-9.]/.test(sql[i]))i++;add('number',start,startLine);continue;}
  i++;add('symbol',start,startLine);
 }
 return tokens;
}
export function statements(sql){const tokens=lex(sql),result=[];let start=0;for(let i=0;i<tokens.length;i++){if(tokens[i].text===';'){const part=tokens.slice(start,i+1);if(part.length)result.push({line:part[0].line,sql:sql.slice(part[0].start,part.at(-1).end),tokens:part});start=i+1;}}if(start<tokens.length){const part=tokens.slice(start);result.push({line:part[0].line,sql:sql.slice(part[0].start),tokens:part});}return result;}
function executableTokens(sql,offset=0,lineOffset=0){return lex(sql).flatMap(t=>{if(t.kind!=='body')return [{...t,start:t.start+offset,end:t.end+offset,line:t.line+lineOffset}];const tag=/^\$[\w]*\$/.exec(t.text)[0];return executableTokens(t.text.slice(tag.length,-tag.length),offset+t.start+tag.length,lineOffset+t.line-1);});}
function argumentsAt(tokens,index,sql){let depth=1,start=index+1,result=[];for(let i=start;i<tokens.length;i++){if(tokens[i].text==='(')depth++;if(tokens[i].text===')')depth--;if((tokens[i].text===','&&depth===1)||depth===0){const part=tokens.slice(start,i);result.push(part.length?sql.slice(part[0].start,part.at(-1).end):'');start=i+1;if(!depth)break;}}return result;}
const identifier='(?:"[^"]+"|[a-z_][\\w$]*)(?:\\s*\\.\\s*(?:"[^"]+"|[a-z_][\\w$]*))?';
const canonical=name=>name.trim().split(/\s*\.\s*/).map(p=>p.startsWith('"')?p.slice(1,-1).replaceAll('""','"'):p.trim().toLowerCase()).join('.');
const qualify=name=>name.includes('.')?name:`public.${name}`;
function argumentTypes(signature){const parts=[];let start=1,depth=0;for(let i=1;i<signature.length-1;i++){if('(['.includes(signature[i]))depth++;if(')]'.includes(signature[i]))depth--;if(signature[i]===','&&depth===0){parts.push(signature.slice(start,i));start=i+1;}}parts.push(signature.slice(start,-1));return parts.filter(s=>!/^\s*OUT\b/i.test(s)).map(s=>s.replace(/\bDEFAULT\b[\s\S]*$/i,'').trim().replace(/^(?:IN|INOUT|VARIADIC)\s+/i,'').replace(/^[a-z_][\w$]*\s+(?=(?:[a-z_]|"))/i,'').replace(/\s*([.\[\]])\s*/g,'$1').toLowerCase()).filter(Boolean);}
export function inspectSql(sql,path){
 const objects=[],references=[],effects=[],cron=[],columns=[],constraints=[];
 for(const statement of statements(sql)){
  const plain=statement.tokens.map(t=>t.kind==='string'||t.kind==='body'?' ':t.text).join(' '),body=statement.tokens.filter(t=>t.kind==='body').map(t=>t.text.replace(/^\$[\w]*\$|\$[\w]*\$$/g,'')).join('\n');
  // Bodies are inventory candidates too; literals within them are excluded from
  // dependency extraction so comments/example commands do not create providers.
  const expanded=executableTokens(statement.sql).map(t=>t.kind==='string'?' ':t.text).join(' ');
  const evidence={path,line:statement.line,sha256:hash(statement.sql)};
  const pattern=new RegExp(`\\bCREATE\\s+(OR\\s+REPLACE\\s+)?(?:(?:UNIQUE|UNLOGGED|TEMPORARY|TEMP|MATERIALIZED)\\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|TRIGGER|POLICY|EXTENSION|INDEX|TYPE|SCHEMA)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${identifier})`,'ig');
  for(const m of expanded.matchAll(pattern)){
   const kind=m[2].toLowerCase(),name=canonical(m[3]);let signature=null,target=null;
   if(['function','procedure'].includes(kind)){const tail=expanded.slice(m.index+m[0].length);let depth=0,end=0;for(;end<tail.length;end++){if(tail[end]==='(')depth++;if(tail[end]===')'&&--depth===0)break;}signature=tail.slice(0,end+1).trim().replace(/\s+/g,' ');}
   if(['trigger','policy','index'].includes(kind)){const mTarget=new RegExp(`\\bON\\s+(?:ONLY\\s+)?(${identifier})`,'i').exec(expanded.slice(m.index+m[0].length));target=mTarget?qualify(canonical(mTarget[1])):null;}
   const returnClause=['function','procedure'].includes(kind)?(/\bRETURNS\s+([\s\S]*?)(?=\bLANGUAGE\b|\bAS\b)/i.exec(expanded.slice(m.index+m[0].length))?.[1]?.trim().replace(/\s+/g,' ')??null):null;
   objects.push({...evidence,kind,name:['extension','schema','policy','trigger','index'].includes(kind)?name:qualify(name),signature,argumentTypes:signature?argumentTypes(signature):null,returnClause,target,replacement:!!m[1],ifNotExists:/\bIF\s+NOT\s+EXISTS\b/i.test(m[0]),conditional:/\bDO\b/i.test(plain),definitionSha256:hash(statement.sql)});
   if(kind==='table'){
    const tail=expanded.slice(m.index+m[0].length),open=tail.indexOf('(');if(open>=0){let depth=1,start=open+1;for(let i=start;i<tail.length&&depth;i++){if(tail[i]==='(')depth++;if(tail[i]===')')depth--;if((tail[i]===','&&depth===1)||depth===0){const segment=tail.slice(start,i).trim(),column=new RegExp(`^(${identifier})\\s+([\\s\\S]+)$`,'i').exec(segment);if(column&&!/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE)\b/i.test(segment))columns.push({...evidence,table:qualify(name),name:canonical(column[1]),typeCandidate:column[2].split(/\b(?:NOT|NULL|DEFAULT|REFERENCES|CONSTRAINT|PRIMARY|UNIQUE|CHECK)\b/i)[0].trim(),declarationFingerprint:hash(segment),operation:'CREATE_TABLE_COLUMN'});start=i+1;}}}
   }
  }
  const altered=new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${identifier})`,'i').exec(expanded);
  if(altered)for(const m of expanded.matchAll(new RegExp(`\\bADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${identifier})`,'ig')))columns.push({...evidence,table:qualify(canonical(altered[1])),name:canonical(m[1]),operation:'ADD_COLUMN',declarationFingerprint:hash(statement.sql)});
  for(const m of expanded.matchAll(new RegExp(`\\b(?:ADD\\s+)?CONSTRAINT\\s+(${identifier})`,'ig')))constraints.push({...evidence,name:canonical(m[1]),table:altered?qualify(canonical(altered[1])):null,definitionSha256:hash(statement.sql),semanticVerification:'REHEARSAL_REQUIRED'});
  for(const m of expanded.matchAll(new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO|REFERENCES|ALTER\\s+TABLE|ON\\s+TABLE)\\s+(?:ONLY\\s+|IF\\s+EXISTS\\s+)?(${identifier})`,'ig'))){const name=canonical(m[1]);references.push({...evidence,kind:'relation_candidate',name:qualify(name)});}
  const updated=new RegExp(`\\bUPDATE\\s+(${identifier})\\s+SET\\s+([\\s\\S]*?)(?=\\bWHERE\\b|;|$)`,'i').exec(expanded);
  if(updated)for(const m of updated[2].matchAll(/\b([a-z_][\w$]*)\s*=/ig))references.push({...evidence,kind:'column_candidate',name:`${qualify(canonical(updated[1]))}.${m[1].toLowerCase()}`});
  for(const m of expanded.matchAll(new RegExp(`\\b(${identifier})\\s*\\(`,'ig'))){const name=canonical(m[1]);if(name.includes('.'))references.push({...evidence,kind:'routine_candidate',name});}
  for(const m of expanded.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+(?:FUNCTION|TABLE|POLICY|TRIGGER|CONSTRAINT)|ADD\s+CONSTRAINT|GRANT|REVOKE)\b/ig))effects.push({...evidence,operation:m[1].toUpperCase(),conflictHandled:/\bON\s+CONFLICT\b/i.test(expanded)});
  const tokens=executableTokens(statement.sql),strings=tokens.filter(t=>t.kind==='string'),endpoints=[...new Set([...statement.sql.matchAll(/\/functions\/v1\/([a-z0-9_-]+)/ig)].map(x=>x[1]))],configuration=[...new Set([...statement.sql.matchAll(/current_setting\s*\(\s*'([^']+)'/ig)].map(x=>x[1]))];
  for(let i=0;i<tokens.length-3;i++)if(tokens[i].text.toLowerCase()==='cron'&&tokens[i+1].text==='.'&&/^(schedule_in_database|schedule|unschedule)$/i.test(tokens[i+2].text)&&tokens[i+3].text==='('){const args=argumentsAt(tokens,i+3,statement.sql);cron.push({...evidence,line:statement.line+tokens[i].line-1,operation:tokens[i+2].text.toLowerCase(),jobNameExpression:args[0]??null,scheduleExpression:args[1]??null,commandSha256:args[2]?hash(args[2]):null,endpoints,configuration,projectRefs:[...new Set([...statement.sql.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/ig)].map(x=>x[1]))],definitionSha256:hash(statement.sql),activation:'PRESERVED_NOT_AUTHORIZED'});}
  for(const m of statement.sql.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'edge_function'\s*,\s*'([^']+)'/ig))cron.push({...evidence,operation:'scheduler_table_target',jobNameExpression:m[1],scheduleExpression:m[3],endpoints:[m[4]],configuration,definitionSha256:hash(statement.sql),activation:'PREPARED_NOT_AUTHORIZED'});
 }
 return {objects,columns,constraints,references:[...new Map(references.map(x=>[`${x.line}:${x.kind}:${x.name}`,x])).values()],effects,cron};
}
