import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diagnosticOverall, presentProviderAccount } from "../../supabase/functions/_shared/provider-account-contract.ts";

const secretOnly = presentProviderAccount({ accountExists: false, credentialsPresent: true, authenticatedRead: true });
assert.equal(secretOnly.credentialReachability, "REACHABLE");
assert.equal(secretOnly.accountConfiguration, "NOT CONFIGURED");
assert.equal(secretOnly.executionAdoption, "EXECUTION DISABLED");
assert.equal(secretOnly.monitorStatus, "READ-ONLY DIAGNOSTIC");
assert.equal(secretOnly.writesSkipped, true);

const bybitDemo = presentProviderAccount({ accountExists: true, credentialsPresent: true, authenticatedRead: true, enabled: true, executionEnabled: false, monitorEnabled: true });
assert.equal(bybitDemo.accountConfiguration, "CONFIGURED");
assert.equal(bybitDemo.monitorStatus, "READY");
assert.equal(bybitDemo.executionAdoption, "EXECUTION DISABLED");
assert.equal(bybitDemo.writesSkipped, false);

assert.equal(diagnosticOverall([{ status: "PASS", required: true }, { status: "NOT CONFIGURED", required: false }]), "DEGRADED");
assert.equal(diagnosticOverall([{ status: "FAIL", required: true }]), "FAIL");
assert.equal(diagnosticOverall([{ status: "FAIL", enabled: false }, { status: "PASS" }]), "DEGRADED");
assert.equal(diagnosticOverall([{ status: "PASS" }]), "PASS");

const ownershipMigration = readFileSync("supabase/migrations/20260722001000_phase5c_execution_account_ownership.sql", "utf8");
const riskMigration = readFileSync("supabase/migrations/20260526080120_008_modes_risk_profiles_paper_execution_backtest.sql", "utf8");
const normalizationMigration = readFileSync("supabase/migrations/20260728000000_provider_account_contract_normalization.sql", "utf8");
assert.match(ownershipMigration, /account_id text NOT NULL/);
assert.match(ownershipMigration, /credential_ref text NOT NULL/);
assert.match(ownershipMigration, /ALTER TABLE public\.execution_monitor_heartbeats[\s\S]*ADD COLUMN IF NOT EXISTS account_id text/);
assert.match(riskMigration, /CREATE TABLE IF NOT EXISTS public\.risk_profiles[\s\S]*id uuid PRIMARY KEY/);
assert.match(normalizationMigration, /risk_profile_id uuid REFERENCES public\.risk_profiles\(id\)/);
assert.match(normalizationMigration, /account_id::text/);
assert.match(normalizationMigration, /execution_enabled boolean NOT NULL DEFAULT false/);
assert.doesNotMatch(normalizationMigration, /capital_profile_id/);
assert.doesNotMatch(normalizationMigration, /api_key|api_secret|password_ciphertext/);

console.log("provider account normalization tests passed");
