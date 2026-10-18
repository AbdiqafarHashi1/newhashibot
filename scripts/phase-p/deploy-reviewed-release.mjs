import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function validateReviewedRelease(plan,root='.'){
 if(plan.status!=='REVIEWABLE_DRY_RUN'||plan.blockers?.length||plan.projectRef!=='uqiwbzfcntlcyyewawfc'||!Array.isArray(plan.pending))throw Error('RECONCILED_PROJECT_PLAN_REQUIRED');
 for(const m of plan.pending){if(!/^supabase\/migrations\/\d{14}_[^/]+\.sql$/.test(m.path))throw Error('AUTOMATIC_MIGRATIONS_ONLY');const hash=createHash('sha256').update(readFileSync(resolve(root,m.path))).digest('hex');if(hash!==m.sha256)throw Error('PENDING_MIGRATION_SOURCE_CHANGED');}
 return plan.pending.map(m=>basename(m.path));
}
export function assertDryRunMatches(output,expected){const actual=[...new Set(output.match(/\d{14}_[A-Za-z0-9_.-]+\.sql/g)??[])].sort();if(JSON.stringify(actual)!==JSON.stringify([...expected].sort()))throw Error('REMOTE_PENDING_LIST_CHANGED_OR_UNREADABLE');}
async function main(){
 const args=process.argv.slice(2),index=args.indexOf('--plan');if(index<0||!args[index+1])throw Error('Usage: node scripts/phase-p/deploy-reviewed-release.mjs --plan <reconciled-plan.json> [--apply]');
 if(args.includes('--install-schedules')&&!process.env.HASHIBOT_ADMIN_JWT)throw Error('AUTHENTICATED_ADMIN_SESSION_REQUIRED_FOR_SCHEDULE_INSTALL');
 const plan=JSON.parse(readFileSync(args[index+1],'utf8')),expected=validateReviewedRelease(plan),cli=process.env.SUPABASE_CLI??'supabase';
 const linked=readFileSync('supabase/.temp/project-ref','utf8').trim();if(linked!==plan.projectRef)throw Error('LINKED_PROJECT_MISMATCH');
 // Discover supported flags before any database or deployment operation.
 const run=(params,capture=false)=>{const r=spawnSync(cli,params,{stdio:capture?['ignore','pipe','pipe']:'inherit',encoding:'utf8'});if(r.error||r.status!==0)throw Error('SUPABASE_COMMAND_FAILED:'+params.slice(0,2).join(' '));return (r.stdout??'')+(r.stderr??'');};
 run(['--help'],true);run(['db','push','--help'],true);run(['functions','deploy','--help'],true);run(['migration','list','--help'],true);
 run(['migration','list','--linked']);
 const dry=run(['db','push','--linked','--dry-run'],true);process.stdout.write(dry);assertDryRunMatches(dry,expected);
 if(!args.includes('--apply')){console.log('Review matched. Re-run the same command with --apply to push pending migrations and deploy all functions.');return;}
 run(['db','push','--linked','--yes']);
 // No prune or blanket JWT override: each function retains its config.toml policy.
 run(['functions','deploy','--project-ref',plan.projectRef,'--use-api','--jobs','4']);
 if(args.includes('--install-schedules')){const response=await fetch(`https://${plan.projectRef}.supabase.co/functions/v1/admin-scheduler-action`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.HASHIBOT_ADMIN_JWT}`},body:JSON.stringify({action:'install_release_schedules'})});const result=await response.json();if(!response.ok||result.success!==true)throw Error('SCHEDULE_INSTALL_REQUIRES_CONFIGURATION:'+String(result.state??response.status));console.log('Worker schedules installed paused.');}
 run(['migration','list','--linked']);run(['functions','list','--project-ref',plan.projectRef]);
 console.log('Database/functions deployed. Keep entries stopped until Launch Setup verifies secrets, schedules, demo connections and authenticated checks. The runner does not request provider, payment or Telegram test actions.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
