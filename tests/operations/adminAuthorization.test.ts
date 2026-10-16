import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyAdminIdentity} from '../../supabase/functions/_shared/verified-admin';
test('shared internal/admin authority rejects ordinary JWTs and missing role; only server-read admin is accepted',async()=>{
 const store={async userForToken(){return {id:'customer-a',user_metadata:{role:'admin'}}},async roleForUser(id:string){assert.equal(id,'customer-a');return 'customer'}};
 assert.deepEqual(await verifyAdminIdentity('jwt',store),{ok:false,status:403,error:'ADMIN_REQUIRED'});
 assert.equal((await verifyAdminIdentity('jwt',{...store,async roleForUser(){return null}})).ok,false);
 assert.equal((await verifyAdminIdentity('jwt',{...store,async userForToken(){return null}})).ok,false);
 assert.deepEqual(await verifyAdminIdentity('jwt',{...store,async roleForUser(){return 'admin'}}),{ok:true,method:'authenticated_jwt'});
});

test('actual shared HTTP guard denies a customer JWT before privileged worker routing',async()=>{
 const {authorizeInternalOrAdmin}=await import('../../supabase/functions/_shared/internal-auth');
 const previous=(globalThis as any).Deno;(globalThis as any).Deno={env:{get:()=>undefined}};
 try{
  const db={auth:{async getUser(){return {data:{user:{id:'customer-a',user_metadata:{role:'admin'}}},error:null}}},from(table:string){assert.equal(table,'profiles');return {select(){return this},eq(field:string,id:string){assert.equal(field,'id');assert.equal(id,'customer-a');return this},async maybeSingle(){return {data:{role:'user'},error:null}}}}};
  const result=await authorizeInternalOrAdmin(new Request('https://local.test/worker',{headers:{Authorization:'Bearer fixture.jwt.value'}}),db as any);
  assert.deepEqual(result,{ok:false,status:403,error:'ADMIN_REQUIRED'});
 }finally{(globalThis as any).Deno=previous}
});
