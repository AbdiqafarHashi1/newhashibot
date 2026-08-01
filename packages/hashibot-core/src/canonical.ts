/**
 * Single-source compatibility facade over existing platform-neutral production
 * modules. Namespace exports avoid symbol collisions without copying logic.
 */
export * as indicatorEngine from "../../../supabase/functions/_shared/indicator-engine.ts";
export * as strategyPlan from "../../../supabase/functions/_shared/strategy-plan.ts";
export * as professionalStrategies from "../../../supabase/functions/_shared/professional-strategies.ts";
export * as forexDomain from "../../../supabase/functions/_shared/forex-domain.ts";
export * as forexRuntimeContracts from "../../../supabase/functions/_shared/forex-runtime-contracts.ts";
export * as forexSignal from "../../../supabase/functions/_shared/forex-signal.ts";
export * as forexProductionStrategies from "../../../supabase/functions/_shared/forex-production-strategies.ts";
export * as forexResearchStrategies from "../../../supabase/functions/_shared/forex-research-strategies.ts";
export * as goldVolatilityBreakout from "../../../supabase/functions/_shared/gold-volatility-breakout.ts";
export * as arbitrator from "../../../supabase/functions/_shared/arbitrator.ts";
export * as riskEngine from "../../../supabase/functions/_shared/professional-risk-engine.ts";
export * as capitalManager from "../../../supabase/functions/_shared/professional-capital-allocation.ts";
export * as executionPlanning from "../../../supabase/functions/_shared/professional-execution-planning.ts";
export * as executionAdoption from "../../../supabase/functions/_shared/professional-execution-adoption.ts";
export * as executionAdapters from "../../../supabase/functions/_shared/professional-execution-adapters.ts";
export * as protectionVerification from "../../../supabase/functions/_shared/professional-protection-verification.ts";
export * as paperTradeLifecycle from "../../../supabase/functions/_shared/paper-trade-lifecycle.ts";
export * as providerAccountContract from "../../../supabase/functions/_shared/provider-account-contract.ts";
export * as telegramContentContracts from "../../../supabase/functions/_shared/telegram-content-contracts.ts";
export * as telegramTaxonomy from "../../../supabase/functions/_shared/telegram-taxonomy.ts";
export * as telegramTemplates from "../../../supabase/functions/_shared/telegram-templates.ts";
export * as professionalTelegram from "../../../supabase/functions/_shared/professional-telegram.ts";
export * as professionalContent from "../../../supabase/functions/_shared/professional-content.ts";
