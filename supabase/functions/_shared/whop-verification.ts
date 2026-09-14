/**
 * Whop webhook verification boundary.
 *
 * The current official signature header/signing algorithm could not be confirmed from
 * this build environment. Fail closed rather than guessing cryptography. Replace only
 * this function with the current official verifier before deployment.
 */
export async function verifyWhopWebhook(_request: Request, _rawBody: string, secret: string | undefined) {
  if (!secret) return { verified: false as const, error: "webhook_secret_not_configured" };
  return { verified: false as const, error: "official_verifier_not_confirmed" };
}
