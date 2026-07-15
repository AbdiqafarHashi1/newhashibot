import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export type InternalAuthResult = { ok: true; method: string } | { ok: false; status: number; error: string };

type InternalSecretConfig = { value: string; sourceName: string };

function configuredInternalSecret(): InternalSecretConfig {
  const primary = Deno.env.get("HASHIBOT_INTERNAL_SECRET") ?? "";
  if (primary) return { value: primary, sourceName: "HASHIBOT_INTERNAL_SECRET" };
  const legacy = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  if (legacy) return { value: legacy, sourceName: "INTERNAL_FUNCTION_SECRET" };
  return { value: "", sourceName: "none" };
}

function logInternalAuthDiagnostic(fields: { internalHeaderPresent: boolean; configuredInternalSecretPresent: boolean; matchedSecretSourceName: string; authResult: string }) {
  console.error("internal auth diagnostic", fields);
}

export async function authorizeInternalOrAdmin(req: Request, supabase: SupabaseClient): Promise<InternalAuthResult> {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalSecret = configuredInternalSecret();
  const suppliedInternalSecret = req.headers.get("x-hashibot-internal-secret") ?? "";
  const finish = (result: InternalAuthResult, matchedSecretSourceName = "none"): InternalAuthResult => {
    logInternalAuthDiagnostic({
      internalHeaderPresent: Boolean(suppliedInternalSecret),
      configuredInternalSecretPresent: Boolean(internalSecret.value),
      matchedSecretSourceName,
      authResult: result.ok ? result.method : result.error,
    });
    return result;
  };
  if (internalSecret.value && suppliedInternalSecret && suppliedInternalSecret === internalSecret.value) return finish({ ok: true, method: "hashibot_internal_secret" }, internalSecret.sourceName);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (serviceRole && token === serviceRole) return finish({ ok: true, method: "service_role" });

  const scannerSecret = Deno.env.get("SCANNER_CRON_SECRET") ?? "";
  if (scannerSecret && req.headers.get("x-scanner-cron-secret") === scannerSecret) return finish({ ok: true, method: "scanner_cron_secret" });

  const hashbotToken = Deno.env.get("HASHIBOT_CRON_TOKEN") ?? Deno.env.get("INTERNAL_CRON_TOKEN") ?? "";
  if (hashbotToken && req.headers.get("x-hashibot-cron-token") === hashbotToken) return finish({ ok: true, method: "hashibot_cron_token_env" });

  const customCronToken = req.headers.get("x-hashibot-cron-token") ?? "";
  if (customCronToken) {
    const { data, error } = await supabase.from("scanner_config").select("cron_pg_token").eq("id", 1).maybeSingle();
    if (error) return finish({ ok: false, status: 500, error: `Cron auth lookup failed: ${error.message}` });
    const cronPgToken = (data as { cron_pg_token?: string } | null)?.cron_pg_token ?? "";
    if (cronPgToken && customCronToken === cronPgToken) return finish({ ok: true, method: "cron_pg_token_header" });
  }

  if (!token) return finish({ ok: false, status: 401, error: "Unauthorized" });
  if (!token.includes(".") && token !== serviceRole) return finish({ ok: false, status: 401, error: "UNAUTHORIZED_INVALID_JWT_FORMAT" });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return finish({ ok: false, status: 401, error: "Unauthorized" });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if ((profile as { role?: string } | null)?.role !== "admin") return finish({ ok: false, status: 403, error: "Forbidden" });
  return finish({ ok: true, method: "admin_jwt" });
}

export function authJsonResponse(result: Extract<InternalAuthResult, { ok: false }>, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ success: false, error: result.error }), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
