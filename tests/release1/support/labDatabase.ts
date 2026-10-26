import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
export async function openLabDatabase(){
const pg=new PGlite();
await pg.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;
 create table strategy_release_candidates(id uuid default gen_random_uuid(),immutable_configuration jsonb);
 create table profiles(id uuid primary key,role text);create table portable_jobs(id uuid,idempotency_key text,customer_id uuid,kind text,payload jsonb,configuration_hash text,execution_account_id uuid);
 create table validation_datasets(id uuid primary key default gen_random_uuid(),source text,status text,symbol text,timeframe text,starts_at timestamptz,ends_at timestamptz,first_open_time timestamptz,last_open_time timestamptz,dataset_hash text,row_count integer,provenance text,coverage jsonb,resume_cursor timestamptz,created_by uuid);
 create table validation_dataset_candles(dataset_id uuid references validation_datasets(id),symbol text,market_type text,timeframe text,open_time timestamptz,open numeric,high numeric,low numeric,close numeric,volume numeric,source text,primary key(dataset_id,open_time),check(high>=greatest(open,close,low)),check(low<=least(open,close,high)));
 alter table validation_datasets enable row level security;alter table validation_dataset_candles enable row level security;
 grant select on validation_datasets,validation_dataset_candles to authenticated;
 create function reject_validation_immutable_update() returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE';end$$;
 create trigger validation_dataset_candles_immutable before update or delete on validation_dataset_candles for each row execute function reject_validation_immutable_update();`);
await pg.exec(readFileSync('supabase/migrations/20261025233617_validation_native_evidence_upload.sql','utf8'));
// Minimal PostgREST query transport backed by actual PostgreSQL, not in-memory records.
function database(){return {from(table:string){assert.ok(['validation_datasets','validation_dataset_candles','validation_research_models','profiles','portable_jobs','validation_runs','validation_cycles','validation_outcomes'].includes(table));let insert:Record<string,unknown>|undefined;const filters:Array<[string,unknown]>=[];let size:number|undefined,offset=0,order='';
 const q:any={select:()=>q,insert:(row:Record<string,unknown>)=>{insert=row;return q},eq:(k:string,v:unknown)=>{assert.match(k,/^[a-z_]+$/);filters.push([k,v]);return q},order:(k:string)=>{assert.match(k,/^[a-z_]+$/);order=k;return q},range:(from:number,to:number)=>{offset=from;size=to-from+1;return q},limit:(n:number)=>{size=n;return q}};
 q.in=(key:string,values:unknown[])=>{assert.equal(values.length,1,'one-dataset PostgreSQL fixture; multi-dataset transport is covered by Phase-P tests');return q.eq(key,values[0]);};
 const execute=async(single=false)=>{try{let rows;
  if(insert){const keys=Object.keys(insert);assert.ok(keys.every(k=>/^[a-z_]+$/.test(k)));const args=keys.map(k=>typeof insert![k]==='object'?JSON.stringify(insert![k]):insert![k]);rows=(await pg.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning to_jsonb(${table}) value`,args)).rows;}
  else {const args=filters.map(x=>x[1]),where=filters.map(([k],i)=>`${k}=$${i+1}`).join(' and ');rows=(await pg.query(`select to_jsonb(t) value from ${table} t ${where?'where '+where:''} ${order?'order by '+order:''} ${size!==undefined?'limit '+size+' offset '+offset:''}`,args)).rows;}
  return{data:single?(rows[0]?.value??null):rows.map((r:any)=>r.value),error:null};
 }catch(error){return{data:null,error};}};
 q.single=()=>execute(true);q.maybeSingle=()=>execute(true);q.then=(resolve:any,reject:any)=>execute().then(resolve,reject);return q;},async rpc(name:string,args:Record<string,unknown>){assert.ok(['append_validation_dataset_chunk','finish_validation_dataset_upload'].includes(name));try{const keys=Object.keys(args),values=keys.map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k]);const r=await pg.query<{value:unknown}>(`select ${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,values);return{data:r.rows[0].value,error:null};}catch(error){return{data:null,error};}}};}
return {pg,db:database()};
}
