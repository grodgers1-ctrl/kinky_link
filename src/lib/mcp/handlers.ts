import { supabaseAdmin } from "@/lib/db"
import { getDomainFacts, getProspectsForKeyword, getCompetitorBacklinks } from "@/lib/corpus"
import { findEmailAcrossProviders } from "@/lib/email-cascade"
import { generateEmailDraft, checkAiUsage, getAiUsageRemaining } from "@/lib/ai-writer"
import { scoreEmail } from "@/lib/spam-score"
import { fetchProspectContext } from "@/lib/prospect-context"
import { exaFindSimilar } from "@/lib/exa"
import { registerTool, jsonResult, errorResult } from "./tools"

registerTool({
  name: "search_prospects",
  description:
    "Find link-building prospect sites for a keyword. Prefers roundup / list / resource-page targets over direct competitor product pages. Uses the shared SERP cache when fresh; hits Tavily on miss. Returns url, title, domain, position, and Moz Domain Authority.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: { type: "string", description: "Search phrase (2-200 chars)" },
      limit: { type: "integer", minimum: 1, maximum: 20, default: 10 },
    },
    required: ["keyword"],
  },
  handler: async (_userId, args) => {
    const keyword = String(args.keyword || "").trim()
    if (!keyword) return errorResult("keyword is required")
    if (keyword.length > 200) return errorResult("keyword too long")
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 10))
    const results = await getProspectsForKeyword(keyword)
    return jsonResult(results.slice(0, limit))
  },
})

registerTool({
  name: "enrich_domain",
  description:
    "Return known facts about a domain: Moz Domain Authority, cached contact email, homepage title/description. Data is shared across all users of linklight so common domains are instant.",
  inputSchema: {
    type: "object",
    properties: {
      domain: { type: "string", description: "Bare hostname, e.g. example.com" },
    },
    required: ["domain"],
  },
  handler: async (_userId, args) => {
    const domain = String(args.domain || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
    if (!domain) return errorResult("domain is required")
    const facts = await getDomainFacts([domain])
    const { data: full } = await supabaseAdmin
      .from("domain_facts")
      .select("domain, domain_authority, contact_email, title, description, last_seen_at, seen_count")
      .eq("domain", domain)
      .maybeSingle()
    return jsonResult({ domain, ...facts[domain], details: full })
  },
})

registerTool({
  name: "list_campaigns",
  description: "List the caller's campaigns with id, name, status, and created_at.",
  inputSchema: { type: "object", properties: {} },
  handler: async (userId) => {
    const { data } = await supabaseAdmin
      .from("campaigns")
      .select("id, name, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
    return jsonResult(data || [])
  },
})

registerTool({
  name: "list_prospects",
  description:
    "List prospects. Filter by campaign_id and/or status (prospect|contacted|replied|live_link|declined|archived).",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      status: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("prospects")
      .select("id, campaign_id, url, domain, title, email, status, domain_authority, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (args.campaign_id) q = q.eq("campaign_id", String(args.campaign_id))
    if (args.status) q = q.eq("status", String(args.status))
    const { data } = await q
    return jsonResult(data || [])
  },
})

registerTool({
  name: "list_backlinks",
  description:
    "List backlinks earned to a site. Filter by health_status (healthy|redirected|broken|unreachable|pending|error).",
  inputSchema: {
    type: "object",
    properties: {
      site_id: { type: "string" },
      health_status: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("backlinks")
      .select(
        "id, site_id, source_url, target_url, anchor_text, first_seen, last_seen, is_indexed, health_status, last_health_check",
      )
      .eq("user_id", userId)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(limit)
    if (args.site_id) q = q.eq("site_id", String(args.site_id))
    if (args.health_status) q = q.eq("health_status", String(args.health_status))
    const { data } = await q
    return jsonResult(data || [])
  },
})

registerTool({
  name: "list_replies",
  description:
    "List prospects who replied to outreach. Optionally filter by ISO-8601 since date.",
  inputSchema: {
    type: "object",
    properties: {
      since: {
        type: "string",
        description: "ISO-8601 timestamp; only prospects updated after this",
      },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("prospects")
      .select("id, campaign_id, url, domain, title, email, status, updated_at")
      .eq("user_id", userId)
      .eq("status", "replied")
      .order("updated_at", { ascending: false })
      .limit(limit)
    if (args.since) q = q.gt("updated_at", String(args.since))
    const { data } = await q
    return jsonResult(data || [])
  },
})

registerTool({
  name: "find_email",
  description:
    "Look up a contact email for a domain via Hunter. Cached in domain_facts on hit.",
  inputSchema: {
    type: "object",
    properties: { domain: { type: "string" } },
    required: ["domain"],
  },
  handler: async (_userId, args) => {
    const domain = String(args.domain || "").trim().toLowerCase()
    if (!domain) return errorResult("domain is required")

    const { data: cached } = await supabaseAdmin
      .from("domain_facts")
      .select("contact_email, email_fetched_at")
      .eq("domain", domain)
      .maybeSingle()
    if (cached?.contact_email) {
      return jsonResult({ domain, email: cached.contact_email, source: "cache" })
    }

    const res = await findEmailAcrossProviders(domain)

    if (res.email) {
      const now = new Date().toISOString()
      await supabaseAdmin.from("domain_facts").upsert(
        {
          domain,
          contact_email: res.email,
          email_fetched_at: now,
          last_seen_at: now,
        },
        { onConflict: "domain" },
      )
      return jsonResult({
        domain,
        email: res.email,
        confidence: res.confidence,
        source: res.source,
        attempts: res.attempts,
      })
    }

    // All providers missed. Report which errored so the caller can act.
    const notConfigured = res.attempts.filter((a) => a.error === "not_configured").map((a) => a.name)
    const rateLimited = res.attempts.filter((a) => a.error === "rate_limited").map((a) => a.name)

    const messageParts: string[] = ["No email found for this domain across configured providers."]
    if (notConfigured.length > 0) {
      messageParts.push(
        `Unconfigured providers (add keys to Vercel to enable): ${notConfigured.join(", ")}.`,
      )
    }
    if (rateLimited.length > 0) {
      messageParts.push(`Rate-limited this cycle: ${rateLimited.join(", ")}.`)
    }

    return jsonResult({
      domain,
      email: null,
      source: null,
      error: "not_found",
      message: messageParts.join(" "),
      attempts: res.attempts,
    })
  },
})

registerTool({
  name: "draft_email",
  description:
    "Generate an outreach email draft. Returns subject, HTML body, plain-text body, and a spam score (0-10, higher = better). Pass prospect_url to fetch the target's page and personalize the draft with a reference to their actual content — this dramatically improves reply rate over generic drafts.",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "What the email is about" },
      article_title: { type: "string", description: "Their article being referenced (optional)" },
      site_name: { type: "string" },
      prospect_name: { type: "string" },
      prospect_url: {
        type: "string",
        description:
          "Optional. If provided, the tool fetches this URL and uses its title + first paragraph to personalize the draft. Best URL is the specific post you want to reference; the homepage works too.",
      },
      tone: {
        type: "string",
        enum: ["friendly", "professional", "direct"],
        default: "friendly",
      },
      campaign_type: { type: "string", default: "outreach" },
    },
    required: ["topic"],
  },
  handler: async (userId, args) => {
    if (!checkAiUsage(userId)) {
      return errorResult(
        `Daily AI writing limit reached. Remaining: ${getAiUsageRemaining(userId)}`,
      )
    }

    let articleTitle = args.article_title ? String(args.article_title) : undefined
    let recentSnippet: string | undefined
    let contextSource: string | null = null

    const prospectUrl = args.prospect_url ? String(args.prospect_url).trim() : ""
    if (prospectUrl) {
      const context = await fetchProspectContext(prospectUrl)
      if (context) {
        contextSource = context.url
        if (!articleTitle && context.title) articleTitle = context.title
        recentSnippet = context.snippet || context.description || undefined
      }
    }

    const draft = await generateEmailDraft({
      topic: String(args.topic),
      articleTitle,
      siteName: args.site_name ? String(args.site_name) : undefined,
      prospectName: args.prospect_name ? String(args.prospect_name) : undefined,
      recentSnippet,
      tone:
        (args.tone as "friendly" | "professional" | "direct" | undefined) ||
        "friendly",
      campaignType:
        (args.campaign_type as
          | "outreach"
          | "guest_post"
          | "resource_page"
          | "skyscraper"
          | "link_reclamation"
          | undefined) || "outreach",
    })
    const spamScore = scoreEmail({
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      bodyText: draft.bodyText,
    })
    return jsonResult({
      draft,
      spamScore,
      personalized: recentSnippet ? true : false,
      contextSource,
      remaining: getAiUsageRemaining(userId),
    })
  },
})

registerTool({
  name: "save_draft",
  description:
    "Save a drafted email as a note on a prospect. Does NOT send — user must review and send from the linklight UI.",
  inputSchema: {
    type: "object",
    properties: {
      prospect_id: { type: "string" },
      subject: { type: "string" },
      body_html: { type: "string" },
      body_text: { type: "string" },
    },
    required: ["prospect_id", "subject", "body_html"],
  },
  handler: async (userId, args) => {
    const prospectId = String(args.prospect_id)
    const subject = String(args.subject)
    const bodyHtml = String(args.body_html)
    const bodyText = args.body_text ? String(args.body_text) : ""

    const { data: prospect } = await supabaseAdmin
      .from("prospects")
      .select("id, notes")
      .eq("id", prospectId)
      .eq("user_id", userId)
      .maybeSingle()
    if (!prospect) return errorResult("Prospect not found")

    const stamp = new Date().toISOString()
    const marker = `--- MCP DRAFT ${stamp} ---\nSubject: ${subject}\n\n${bodyText || bodyHtml.replace(/<[^>]+>/g, " ")}\n`
    const combined = prospect.notes ? `${prospect.notes}\n\n${marker}` : marker

    const { error } = await supabaseAdmin
      .from("prospects")
      .update({ notes: combined, updated_at: stamp })
      .eq("id", prospectId)
      .eq("user_id", userId)
    if (error) return errorResult(`Failed to save draft: ${error.message}`)
    return jsonResult({ ok: true, prospect_id: prospectId, saved_at: stamp })
  },
})

registerTool({
  name: "find_similar_prospects",
  description:
    "Given a known-good prospect URL, return semantically similar URLs via Exa.ai's neural search. Use this when the caller already has one great prospect and wants 5-20 more like it. Excludes the source domain by default.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The reference URL (e.g. https://backlinko.com/link-building-tools)",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
    },
    required: ["url"],
  },
  handler: async (_userId, args) => {
    const url = String(args.url || "").trim()
    if (!url) return errorResult("url is required")
    try {
      new URL(url)
    } catch {
      return errorResult(`Invalid URL: ${url}`)
    }
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 10))
    const results = await exaFindSimilar(url, { numResults: limit })
    const enriched = results.map((r) => {
      let domain = ""
      try {
        domain = new URL(r.url).hostname.replace(/^www\./, "")
      } catch {
        // fall through
      }
      return { url: r.url, title: r.title, score: r.score, domain }
    })
    return jsonResult(enriched)
  },
})

interface GscKeywordRow {
  keyword: string
  clicks: number
  impressions: number
  ctr: number
  avg_position: number
}

function keywordOpportunity(row: GscKeywordRow): number {
  return row.impressions * (1 / Math.max(row.avg_position, 1))
}

registerTool({
  name: "find_quick_win_keywords",
  description:
    "Return keywords the caller's site is ranking for in Search Console, filtered to 'quick win' opportunities: position 11-30 with meaningful impressions. Sorted by opportunity score (impressions ÷ position). Use to answer 'what should I write about next?'",
  inputSchema: {
    type: "object",
    properties: {
      site_id: { type: "string", description: "UUID from list_campaigns' sites (or run list_sites first)" },
      min_impressions: { type: "integer", minimum: 1, default: 10 },
      position_min: { type: "number", minimum: 1, default: 11 },
      position_max: { type: "number", minimum: 1, default: 30 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
    required: ["site_id"],
  },
  handler: async (userId, args) => {
    const siteId = String(args.site_id || "")
    if (!siteId) return errorResult("site_id is required")

    const { data: rows } = await supabaseAdmin
      .from("keywords")
      .select("keyword, clicks, impressions, ctr, avg_position")
      .eq("user_id", userId)
      .eq("site_id", siteId)
      .eq("source", "gsc")

    if (!rows || rows.length === 0) {
      return jsonResult([])
    }

    const minImp = Number(args.min_impressions) || 10
    const posMin = Number(args.position_min) || 11
    const posMax = Number(args.position_max) || 30
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 20))

    const filtered = (rows as GscKeywordRow[])
      .filter((r) => r.impressions >= minImp && r.avg_position >= posMin && r.avg_position <= posMax)
      .map((r) => ({ ...r, opportunity: keywordOpportunity(r) }))
      .sort((a, b) => b.opportunity - a.opportunity)
      .slice(0, limit)

    return jsonResult(filtered)
  },
})

registerTool({
  name: "find_prospect_gaps",
  description:
    "Return prospects in a campaign that are missing a contact email, sorted by Domain Authority DESC. Use to answer 'which prospects should I run find_email on next?'",
  inputSchema: {
    type: "object",
    properties: {
      campaign_id: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
    required: ["campaign_id"],
  },
  handler: async (userId, args) => {
    const campaignId = String(args.campaign_id || "")
    if (!campaignId) return errorResult("campaign_id is required")
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 20))

    const { data } = await supabaseAdmin
      .from("prospects")
      .select("id, url, domain, title, domain_authority, status, created_at")
      .eq("user_id", userId)
      .eq("campaign_id", campaignId)
      .or("email.is.null,email.eq.")
      .order("domain_authority", { ascending: false, nullsFirst: false })
      .limit(limit)

    return jsonResult(data || [])
  },
})

registerTool({
  name: "list_lost_backlinks",
  description:
    "Return backlinks in unhealthy states (broken, unreachable, redirected). Use to answer 'what did I lose recently?' Combine with a since filter to scope to a time window.",
  inputSchema: {
    type: "object",
    properties: {
      site_id: { type: "string" },
      since: {
        type: "string",
        description: "ISO-8601 timestamp — only include backlinks whose last_health_check is after this",
      },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  handler: async (userId, args) => {
    const limit = Math.min(100, Math.max(1, Number(args.limit) || 50))
    let q = supabaseAdmin
      .from("backlinks")
      .select(
        "id, site_id, source_url, target_url, anchor_text, first_seen, last_seen, is_indexed, health_status, last_health_check",
      )
      .eq("user_id", userId)
      .in("health_status", ["broken", "unreachable", "redirected"])
      .order("last_health_check", { ascending: false, nullsFirst: false })
      .limit(limit)

    if (args.site_id) q = q.eq("site_id", String(args.site_id))
    if (args.since) q = q.gt("last_health_check", String(args.since))

    const { data } = await q
    return jsonResult(data || [])
  },
})

registerTool({
  name: "find_competitor_backlinks",
  description:
    "Return pages that link to or feature a competitor in roundups / lists / alternatives / vs. articles — the classic 'who could realistically link to me if they link to my competitor' list. Optionally excludes domains that already link to my_domain (pass my_domain to get only NEW opportunities). Returns url, title, domain, position, and Moz Domain Authority.",
  inputSchema: {
    type: "object",
    properties: {
      competitor_domain: {
        type: "string",
        description: "The competitor's domain, e.g. 'ahrefs.com'. Scheme and www. prefixes are stripped.",
      },
      my_domain: {
        type: "string",
        description:
          "Optional. If provided, domains that already appear as source_url on the caller's backlinks are filtered out so results are only NEW opportunities.",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    required: ["competitor_domain"],
  },
  handler: async (userId, args) => {
    const competitor = String(args.competitor_domain || "").trim()
    if (!competitor) return errorResult("competitor_domain is required")

    const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
    const myDomain = String(args.my_domain || "")
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./, "")
      .toLowerCase()

    let excludeDomains: string[] = []
    if (myDomain) {
      const { data: existing } = await supabaseAdmin
        .from("backlinks")
        .select("source_url")
        .eq("user_id", userId)

      const domains = new Set<string>()
      for (const row of existing || []) {
        if (!row.source_url) continue
        try {
          const host = new URL(row.source_url).hostname.replace(/^www\./, "").toLowerCase()
          if (host) domains.add(host)
        } catch {
          // skip malformed URLs
        }
      }
      excludeDomains = Array.from(domains)
    }

    const results = await getCompetitorBacklinks({
      competitor,
      excludeDomains,
      limit,
    })

    return jsonResult({
      competitor,
      my_domain: myDomain || null,
      excluded_count: excludeDomains.length,
      results,
    })
  },
})
