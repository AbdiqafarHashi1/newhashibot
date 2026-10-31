#!/usr/bin/env node
/** Configuration presence only. Never prints values or initiates provider operations. */
const env=process.env,issues=[];
const groups=[['SUPABASE_URL'],['SUPABASE_SERVICE_ROLE_KEY'],['VITE_SUPABASE_URL'],['VITE_SUPABASE_ANON_KEY'],['TELEGRAM_BOT_TOKEN'],['TELEGRAM_WEBHOOK_SECRET'],['TELEGRAM_CHAT_ID'],['TELEGRAM_FREE_CHAT_ID'],['TELEGRAM_ADMIN_CHAT_ID'],['WHOP_API_KEY'],['WHOP_COMPANY_ID'],['WHOP_WEBHOOK_SECRET'],['WHOP_VIP_PLAN_ID'],['DARAJA_CONSUMER_KEY','MPESA_CONSUMER_KEY'],['DARAJA_CONSUMER_SECRET','MPESA_CONSUMER_SECRET'],['DARAJA_SHORT_CODE','MPESA_SHORTCODE'],['DARAJA_PASSKEY','MPESA_PASSKEY'],['DARAJA_CALLBACK_URL','MPESA_CALLBACK_URL'],['DARAJA_TRANSACTION_TYPE','MPESA_TRANSACTION_TYPE'],['DARAJA_PARTY_B','MPESA_PARTY_B']];
const read=(keys)=>keys.map(k=>env[k]?.trim()).filter(Boolean);
for(const keys of groups){const values=read(keys);if(!values.length)issues.push('MISSING: '+keys.join(' or '));if(new Set(values).size>1)issues.push('CONFLICTING ALIASES: '+keys.join(', '));}
for(const key of Object.keys(env))if(/^VITE_/.test(key)&&/(SECRET|PASSKEY|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY|CONSUMER_KEY|BOT_TOKEN)/.test(key)&&env[key])issues.push('UNSAFE PUBLIC VARIABLE NAME: '+key);
if(env.TELEGRAM_CHAT_ID&&env.TELEGRAM_CHAT_ID===env.TELEGRAM_FREE_CHAT_ID)issues.push('FREE_AND_VIP_DESTINATIONS_MUST_DIFFER');
if(read(['DARAJA_TRANSACTION_TYPE','MPESA_TRANSACTION_TYPE'])[0]!=='CustomerBuyGoodsOnline')issues.push('BUY_GOODS_TRANSACTION_TYPE_NOT_CONFIRMED');
console.log('HashiBot Release 1 configuration presence preflight');
issues.forEach(issue=>console.error(issue));
console.log('Database provider/audience settings, bot permissions, source verification, certification and deployment require separate checks. Browser Whop checkout URLs and manual Send Money are not payment authorities. Keep sales paused until release blockers are resolved.');
process.exitCode=issues.length?1:0;
