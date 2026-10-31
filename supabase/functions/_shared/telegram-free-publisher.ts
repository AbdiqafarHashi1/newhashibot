/**
 * HashiBot Phase 7A-2A Free Channel Publisher Engine
 * Backend-controlled publisher enforcing strict 0-2 signals/day cap, selection criteria,
 * publication modes (preview, delayed, full), and decision persistence.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export type FreePublicationMode = "preview" | "delayed" | "full";

export type DecisionCode =
  | "SELECTED"
  | "DAILY_CAP"
  | "ALREADY_PUBLISHED"
  | "DUPLICATE"
  | "EXPIRED"
  | "CANCELLED"
  | "COOLDOWN"
  | "LOW_PRIORITY"
  | "INVALID";

export interface FreeSignalCandidate {
  id: string;
  symbol: string;
  market_type: string;
  direction: string;
  grade: string;
  confidence_score: number;
  risk_reward: number;
  timeframe: string;
  strategy_name: string;
  entry_low?: number;
  entry_high?: number;
  stop_loss?: number;
  tp1?: number;
  tp2?: number;
  status: string;
  arbitrator_decision?: { final_decision?: string } | null;
  data_source?: string;
  created_at: string;
}

export interface FreePublisherConfig {
  maxDailySignals: number; // Default: 2
  minGrade: string; // Default: "A"
  minConfidence: number; // Default: 75
  minRR: number; // Default: 1.5
  publicationMode: FreePublicationMode; // Default: "full"
  cooldownHours: number; // Default: 4
}

export const DEFAULT_FREE_PUBLISHER_CONFIG: FreePublisherConfig = {
  maxDailySignals: 2,
  minGrade: "A",
  minConfidence: 75,
  minRR: 1.5,
  publicationMode: "preview",
  cooldownHours: 4,
};

function gradeIndex(g: string): number {
  const order = ["C", "B", "A", "A+"];
  const idx = order.indexOf(g.toUpperCase());
  return idx === -1 ? 0 : idx + 1;
}

/**
 * Persist publication decision to database
 */
export async function persistPublicationDecision(
  supabase: SupabaseClient,
  signalId: string,
  decision: DecisionCode,
  reason: string,
  mode: FreePublicationMode = "preview",
  candidate?: FreeSignalCandidate
): Promise<void> {
  try {
    await supabase.from("free_channel_publications").insert({
      signal_id: signalId,
      decision,
      decision_reason: reason,
      publication_mode: mode,
      grade: candidate?.grade,
      confidence: candidate?.confidence_score,
      rr_ratio: candidate?.risk_reward,
      published_at: decision === "SELECTED" ? new Date().toISOString() : null,
    });
  } catch {
    // Non-blocking logging failure
  }
}

/**
 * Check how many Free signals have been published in the last 24 hours
 */
export async function get24HourPublicationCount(supabase: SupabaseClient): Promise<number> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("free_channel_publications")
      .select("id", { count: "exact", head: true })
      .eq("decision", "SELECTED")
      .gte("published_at", twentyFourHoursAgo);

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Check if a signal was previously published to the Free Channel
 */
export async function isSignalPublishedToFree(supabase: SupabaseClient, signalId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("free_channel_publications")
      .select("id")
      .eq("signal_id", signalId)
      .eq("decision", "SELECTED")
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

/**
 * Evaluate if a candidate signal qualifies for the Free Channel
 */
export async function evaluateFreeChannelCandidate(
  supabase: SupabaseClient,
  candidate: FreeSignalCandidate,
  config: FreePublisherConfig = DEFAULT_FREE_PUBLISHER_CONFIG
): Promise<{ eligible: boolean; decision: DecisionCode; reason: string }> {
  // 1. Check validity & completeness
  if (!candidate.id || !candidate.symbol || !candidate.direction) {
    return { eligible: false, decision: "INVALID", reason: "Missing essential signal fields" };
  }

  // 2. Reject non-real or unapproved signals
  if (candidate.data_source && candidate.data_source !== "REAL DATA") {
    return { eligible: false, decision: "INVALID", reason: "Not real market data" };
  }

  const arbDecision = candidate.arbitrator_decision?.final_decision;
  if (arbDecision && arbDecision !== "approved") {
    return { eligible: false, decision: "INVALID", reason: `Arbitrator decision: ${arbDecision}` };
  }

  // 3. Status check: must be active/waiting/approved, not expired/cancelled
  const status = candidate.status.toLowerCase();
  if (status === "expired") {
    return { eligible: false, decision: "EXPIRED", reason: "Signal already expired" };
  }
  if (status === "cancelled" || status === "rejected") {
    return { eligible: false, decision: "CANCELLED", reason: "Signal cancelled or rejected" };
  }

  // 4. Check Grade threshold
  if (gradeIndex(candidate.grade) < gradeIndex(config.minGrade)) {
    return { eligible: false, decision: "LOW_PRIORITY", reason: `Grade ${candidate.grade} below min ${config.minGrade}` };
  }

  // 5. Check Confidence & RR
  if (candidate.confidence_score < config.minConfidence) {
    return { eligible: false, decision: "LOW_PRIORITY", reason: `Confidence ${candidate.confidence_score}% below min ${config.minConfidence}%` };
  }
  if (candidate.risk_reward < config.minRR) {
    return { eligible: false, decision: "LOW_PRIORITY", reason: `RR ${candidate.risk_reward} below min ${config.minRR}` };
  }

  // 6. Check if already published
  const alreadyPublished = await isSignalPublishedToFree(supabase, candidate.id);
  if (alreadyPublished) {
    return { eligible: false, decision: "ALREADY_PUBLISHED", reason: "Signal previously published to Free Channel" };
  }

  // 7. Check 24-hour publication cap (max 0–2 per day)
  const currentCount = await get24HourPublicationCount(supabase);
  if (currentCount >= config.maxDailySignals) {
    return { eligible: false, decision: "DAILY_CAP", reason: `Daily cap of ${config.maxDailySignals} signals reached (${currentCount} published)` };
  }

  return { eligible: true, decision: "SELECTED", reason: "Qualifies for Free Channel publication" };
}
