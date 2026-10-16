import { Webhook, WebhookVerificationError } from "npm:standardwebhooks@1.0.0";

// Mirrors @whop/sdk 1.1.4's official verifyWebhook helper: Whop signs with the
// literal ws_-prefixed secret, while standardwebhooks expects a base64 key.
function officialWhopHmacKey(secret: string) {
  const bytes = new TextEncoder().encode(secret);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type WhopVerifiedEvent = { id: string; type: string; timestamp: string; api_version: "v1"; api_version_date: string | null; data: Record<string, unknown> };

export function verifyWhopWebhook(rawBody: string, headers: Headers, secret: string | undefined) {
  if (!secret) return { verified: false as const, error: "missing_configuration:WHOP_WEBHOOK_SECRET" };
  try {
    const event = new Webhook(officialWhopHmacKey(secret)).verify(rawBody, {
      "webhook-id": headers.get("webhook-id") ?? "",
      "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
    }) as WhopVerifiedEvent;
    return { verified: true as const, event: {...event,id:headers.get("webhook-id")!,timestamp:event.timestamp??new Date(Number(headers.get("webhook-timestamp"))*1000).toISOString()} };
  } catch (error) {
    return { verified: false as const, error: error instanceof WebhookVerificationError ? "invalid_webhook_signature" : "webhook_verification_failed" };
  }
}
