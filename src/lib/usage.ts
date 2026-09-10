// Per-user daily budgets for MCP tools that can hit external APIs.
//
// Zero-cost mission: free tiers (Tavily ~1k/mo, Hunter/Apollo/etc. free
// allotments, Exa trial credits) are the entire data budget. Budgets exist so
// an agent loop or leaked key degrades to a structured error instead of an
// exhausted provider account.
//
// Cache hits are never counted — callers only record usage when an external
// API was actually called. Limits are env-overridable so provider changes
// don't require code edits.

import { supabaseAdmin } from "@/lib/db"

export interface BudgetCheck {
  allowed: boolean
  limit: number
  remaining: number | null // null when we couldn't read usage (fail-open)
  resetsAt: string // ISO timestamp of next UTC midnight
}

const DEFAULT_BUDGETS: Record<string, number> = {
  search_prospects: 30,
  find_competitor_backlinks: 30,
  find_email: 20,
  find_similar_prospects: 15,
}

function limitFor(tool: string): number {
  const envKey = `LL_BUDGET_${tool.toUpperCase()}`
  const fromEnv = Number(process.env[envKey])
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv)
  return DEFAULT_BUDGETS[tool] ?? 0
}

function nextUtcMidnight(): string {
  const d = new Date()
  d.setUTCHours(24, 0, 0, 0)
  return d.toISOString()
}

/** Tools without a configured budget (limit 0) are unmetered. */
export function hasBudget(tool: string): boolean {
  return limitFor(tool) > 0
}

export async function checkBudget(userId: string, tool: string): Promise<BudgetCheck> {
  const limit = limitFor(tool)
  const resetsAt = nextUtcMidnight()
  if (limit <= 0) return { allowed: true, limit: 0, remaining: null, resetsAt }

  const { data, error } = await supabaseAdmin
    .from("api_key_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("day", new Date().toISOString().slice(0, 10))
    .eq("tool", tool)
    .maybeSingle()

  if (error) {
    // Fail-open: a usage-table hiccup shouldn't block legitimate work.
    console.error("checkBudget read failed:", error.message)
    return { allowed: true, limit, remaining: null, resetsAt }
  }

  const used = data?.count ?? 0
  return { allowed: used < limit, limit, remaining: Math.max(0, limit - used), resetsAt }
}

/** Record one external-API-consuming call. Fire-and-forget safe. */
export async function recordUsage(userId: string, tool: string): Promise<void> {
  if (limitFor(tool) <= 0) return
  const { error } = await supabaseAdmin.rpc("bump_usage", {
    p_user_id: userId,
    p_tool: tool,
  })
  if (error) console.error("recordUsage failed:", error.message)
}

/** Standard structured error when a budget is exhausted. */
export function budgetExceededMessage(tool: string, check: BudgetCheck): string {
  return (
    `Daily budget reached for ${tool}: ${check.limit} external API calls/day. ` +
    `Cache-served calls never count against this. ` +
    `Budget resets at ${check.resetsAt} (UTC midnight). ` +
    `Self-serve override: set LL_BUDGET_${tool.toUpperCase()} in the environment.`
  )
}
