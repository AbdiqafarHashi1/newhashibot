import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey" };
type Json = Record<string, unknown>; const text = (v: unknown) => typeof v === 'string' ? v : ''; const json = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const render = (template: string, payload: Json) => template.replace(/{{\s*([\w.]+)\s*}}/g, (_m, p) => String(payload[p] ?? ''));
Deno.serve(async (req) => {
 if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders }); if (req.method !== 'POST') return json({ success:false, error:'Method not allowed' },405);
 const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
 let body: Json; try { body = await req.json(); } catch { return json({ success:false, error:'Invalid JSON' },400); }
 const action = text(body.action);
 try {
  if (action === 'send_message' || action === 'send_test_message') {
   const { data, error } = await supabase.from('telegram_delivery_queue').insert({ channel_id: body.channel_id ?? null, customer_id: body.customer_id ?? null, template_key: text(body.template_key) || 'admin_error', payload: body.payload ?? {}, rendered_message: text(body.message), status: 'queued' }).select('id').maybeSingle(); if (error) throw error;
   await supabase.rpc('log_telegram_delivery', { p_queue_id: data?.id, p_status: 'delivered', p_provider_message_id: action === 'send_test_message' ? 'test-message' : 'queued-message', p_error: '', p_response: { action } });
   return json({ success:true, queue_id:data?.id });
  }
  if (action === 'route_event_to_channel') {
   const payload = (body.payload ?? {}) as Json; const eventType = text(body.event_type); const { data: routes, error } = await supabase.from('telegram_routes').select('id,template_key,channel_category,telegram_templates(body)').eq('event_type', eventType).eq('enabled', true); if (error) throw error;
   const queued = [] as string[]; for (const route of routes ?? []) { const templateBody = Array.isArray(route.telegram_templates) ? route.telegram_templates[0]?.body : (route.telegram_templates as { body?: string } | null)?.body; const message = render(templateBody ?? '', payload); const { data: channelRows, error: channelError } = await supabase.from('telegram_channels').select('id').eq('category', route.channel_category).eq('enabled', true); if (channelError) throw channelError; for (const channel of channelRows ?? []) { const { data } = await supabase.from('telegram_delivery_queue').insert({ event_id: body.event_id ?? null, customer_id: body.customer_id ?? null, route_id: route.id, channel_id: channel.id, template_key: route.template_key, payload, rendered_message: message, status: 'queued' }).select('id').maybeSingle(); if (data?.id) queued.push(data.id); } }
   return json({ success:true, queued });
  }
  if (action === 'retry_failed_message') { const { data, error } = await supabase.from('telegram_delivery_queue').update({ status:'queued', next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.queue_id).select('id').maybeSingle(); if (error) throw error; return json({ success:true, queue_id:data?.id }); }
  if (action === 'log_delivery_result') { const { data, error } = await supabase.rpc('log_telegram_delivery', { p_queue_id: body.queue_id, p_status: text(body.status) || 'failed', p_provider_message_id: text(body.provider_message_id), p_error: text(body.error), p_response: body.response ?? {} }); if (error) throw error; return json({ success:true, log_id:data }); }
  return json({ success:false, error:'Unsupported telegram action' },400);
 } catch (error) { return json({ success:false, error:error instanceof Error ? error.message : String(error) },500); }
});
