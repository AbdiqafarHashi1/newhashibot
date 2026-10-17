import {test} from 'node:test';import assert from 'node:assert/strict';import {adminRequestError} from '../../src/lib/adminRequestError';
test('admin errors explain known backend failures without exposing arbitrary provider or database details',async()=>{
 assert.match(await adminRequestError(null,{context:new Response(JSON.stringify({error:'CONTACT_PERMISSION_REQUIRED'}),{status:409})}),/contact permission/);
 assert.match(await adminRequestError({error:'WHOP_FIELDS_REQUIRED'},null),/Whop API key/);
 assert.match(await adminRequestError(null,{context:new Response('private database key',{status:401})}),/sign in/);
 const message=await adminRequestError({error:'private database key'},{message:'private provider response'});assert.equal(message.includes('private'),false);assert.match(message,/could not be confirmed/);
});
