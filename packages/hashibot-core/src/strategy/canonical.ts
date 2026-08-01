// These are the existing canonical pure engines. This facade changes no logic and
// keeps parity tests pointed at the exact functions used by current Edge handlers.
export * as indicators from "../../../../supabase/functions/_shared/indicator-engine.ts";
export * as strategies from "../../../../supabase/functions/_shared/professional-strategies.ts";
export * as forexProduction from "../../../../supabase/functions/_shared/forex-production-strategies.ts";
export * as forexResearch from "../../../../supabase/functions/_shared/forex-research-strategies.ts";
export * as gold from "../../../../supabase/functions/_shared/gold-volatility-breakout.ts";
export * as arbitrator from "../../../../supabase/functions/_shared/arbitrator.ts";
export * as risk from "../../../../supabase/functions/_shared/professional-risk-engine.ts";
export * as capital from "../../../../supabase/functions/_shared/professional-capital-allocation.ts";
export * as executionPlanning from "../../../../supabase/functions/_shared/professional-execution-planning.ts";
export * as protection from "../../../../supabase/functions/_shared/professional-protection-verification.ts";
