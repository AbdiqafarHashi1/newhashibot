export type ProviderSemanticState =
  | "NOT CONFIGURED" | "CONFIGURED" | "REACHABLE" | "AUTH FAILED"
  | "DISCONNECTED" | "EXECUTION DISABLED" | "EXECUTION ENABLED"
  | "MONITORING" | "DEGRADED" | "BLOCKED";

export type ProviderMonitorStatus = "NOT CONFIGURED" | "READY" | "MONITORING" | "READ-ONLY DIAGNOSTIC" | "DEGRADED" | "BLOCKED";

export interface ProviderAccountEvidence {
  accountExists: boolean;
  credentialsPresent: boolean;
  authenticatedRead?: boolean;
  authFailed?: boolean;
  enabled?: boolean;
  executionEnabled?: boolean;
  monitorEnabled?: boolean;
  monitorRunning?: boolean;
  monitorDegraded?: boolean;
  blocked?: boolean;
  truthObservedAt?: string | null;
  firstBlocker?: string | null;
}

export interface ProviderAccountPresentation {
  credentialReachability: ProviderSemanticState;
  accountConfiguration: ProviderSemanticState;
  executionAdoption: ProviderSemanticState;
  monitorStatus: ProviderMonitorStatus;
  accountTruthFreshness: string | null;
  firstBlocker: string | null;
  configuredAccount: boolean;
  writesSkipped: boolean;
}

/**
 * One presentation contract for Binance Testnet and Bybit Demo.  In
 * particular, deployment secrets prove only credential reachability: they do
 * not manufacture account identity, ownership, policy, or execution adoption.
 */
export function presentProviderAccount(evidence: ProviderAccountEvidence): ProviderAccountPresentation {
  const credentialReachability: ProviderSemanticState = evidence.authFailed
    ? "AUTH FAILED"
    : evidence.authenticatedRead
      ? "REACHABLE"
      : evidence.credentialsPresent
        ? "CONFIGURED"
        : "NOT CONFIGURED";
  const accountConfiguration: ProviderSemanticState = evidence.accountExists ? "CONFIGURED" : "NOT CONFIGURED";
  const executionAdoption: ProviderSemanticState = evidence.accountExists && evidence.enabled && evidence.executionEnabled
    ? "EXECUTION ENABLED"
    : "EXECUTION DISABLED";
  const monitorStatus: ProviderMonitorStatus = !evidence.accountExists
    ? (evidence.authenticatedRead ? "READ-ONLY DIAGNOSTIC" : "NOT CONFIGURED")
    : evidence.blocked
      ? "BLOCKED"
      : evidence.monitorDegraded
        ? "DEGRADED"
        : evidence.monitorRunning
          ? "MONITORING"
          : evidence.monitorEnabled
            ? "READY"
            : "NOT CONFIGURED";

  return {
    credentialReachability,
    accountConfiguration,
    executionAdoption,
    monitorStatus,
    accountTruthFreshness: evidence.accountExists ? evidence.truthObservedAt ?? null : null,
    firstBlocker: evidence.firstBlocker ?? (!evidence.accountExists ? "No canonical execution-account identity" : null),
    configuredAccount: evidence.accountExists,
    writesSkipped: !evidence.accountExists,
  };
}

export type DiagnosticCheckStatus = "PASS" | "WARNING" | "FAIL" | "BLOCKED" | "NOT CONFIGURED";

export function diagnosticOverall(checks: ReadonlyArray<{ status: DiagnosticCheckStatus; required?: boolean; enabled?: boolean }>): "PASS" | "DEGRADED" | "FAIL" {
  if (checks.some((check) => check.status === "FAIL" && check.required !== false && check.enabled !== false)) return "FAIL";
  if (checks.some((check) => check.status !== "PASS")) return "DEGRADED";
  return "PASS";
}
