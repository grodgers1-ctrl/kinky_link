import Link from "next/link"
import { headers } from "next/headers"
import { McpSetupSnippets } from "@/components/settings/mcp-setup-snippets"

const TOOLS = [
  { name: "search_prospects", description: "Find prospect sites for a keyword (cached SERP + Moz DA)." },
  { name: "enrich_domain", description: "Return known facts about a domain — DA, contact email, homepage title/description." },
  { name: "find_email", description: "Look up a contact email for a domain via Hunter." },
  { name: "draft_email", description: "Generate an outreach email draft with a built-in spam score." },
  { name: "save_draft", description: "Save a drafted email against a prospect for you to review. Never sends automatically." },
  { name: "list_campaigns", description: "List your campaigns." },
  { name: "list_prospects", description: "List prospects, filterable by campaign and status." },
  { name: "list_backlinks", description: "List backlinks earned to your sites." },
  { name: "list_replies", description: "List prospects who have replied to outreach." },
  { name: "find_similar_prospects", description: "Given a known-good prospect URL, return semantically similar URLs via Exa.ai. Great for 'find me 20 more like this one.'" },
  { name: "find_quick_win_keywords", description: "Return keywords ranking on GSC pages 2-3 with impressions — the striking-distance opportunities. Sorted by opportunity score." },
  { name: "find_prospect_gaps", description: "Return prospects in a campaign that are missing a contact email, sorted by Domain Authority." },
  { name: "list_lost_backlinks", description: "Return backlinks that are currently broken, unreachable, or redirected. Optionally filter by since date." },
  { name: "find_competitor_backlinks", description: "Find pages that link to or feature a competitor in roundups / alternatives / vs. articles. Pass my_domain to get only NEW opportunities (domains that don't already link to you)." },
]

export default async function McpDocsPage() {
  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const proto = h.get("x-forwarded-proto") || "https"
  const origin = `${proto}://${host}`

  return (
    <div className="bg-brand-surface">
      <header className="border-b border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/kinklink_logo.png" alt="" className="h-7 w-auto" />
            <span className="text-lg font-semibold text-brand-secondary">kinkylink</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-[#575858] hover:text-brand-secondary">
              Pricing
            </Link>
            <Link href="/#features" className="hidden text-[#575858] hover:text-brand-secondary sm:inline">
              Features
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg bg-brand-secondary px-3 py-1.5 text-brand-white hover:bg-[#1f0066]"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-accent">
          Integrations
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-brand-secondary">
          Drive linklight from your AI agent.
        </h1>
        <p className="mt-4 text-lg text-[#575858]">
          linklight ships a first-class MCP (Model Context Protocol) server. Connect it to
          Claude Desktop, Claude Code, Cursor, or any MCP-compatible client and your agent
          can find prospects, draft outreach, and prepare campaigns on your behalf. Sending
          always waits for a manual tap in the linklight UI.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">1. Get an API key</h2>
          <p className="mt-2 text-[#575858]">
            Sign in to linklight, go to{" "}
            <Link
              href="/dashboard/settings/api-access"
              className="text-brand-accent hover:underline"
            >
              Settings → API Access
            </Link>{" "}
            and generate a key. Copy it — you&apos;ll only see it once.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">2. Add it to your client</h2>
          <div className="mt-4">
            <McpSetupSnippets origin={origin} />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">3. Available tools</h2>
          <ul className="mt-4 space-y-3">
            {TOOLS.map((t) => (
              <li
                key={t.name}
                className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4"
              >
                <p className="font-mono text-sm font-semibold text-brand-secondary">
                  {t.name}
                </p>
                <p className="mt-1 text-sm text-[#575858]">{t.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-lg border border-[#DCDDDE] bg-brand-primary p-6">
          <h2 className="text-lg font-semibold text-brand-secondary">Try prompting your agent</h2>
          <div className="mt-3 space-y-3">
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Find the top 10 prospects for "nextjs seo" with DA ≥ 40.
For each, draft a warm personalized email referencing their most recent post,
save each draft against the prospect, and show me the spam scores.`}
            </pre>
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`I already have one great prospect at https://backlinko.com. Use find_similar_prospects
to give me 20 more sites like it, ranked by score.`}
            </pre>
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Show me all lost backlinks from the past 14 days for my main site, grouped by
domain, then draft outreach to try to recover the top 5.`}
            </pre>
            <pre className="overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Find my quick-win keywords, pick the top 3 by opportunity score, and suggest
content-gap articles I could write to move them onto page 1.`}
            </pre>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-brand-secondary">What linklight will NOT do</h2>
          <p className="mt-2 text-[#575858]">
            The MCP surface is deliberately narrower than your dashboard capabilities. There is no
            &ldquo;send this email&rdquo; tool and no destructive tools. Anything with real-world
            consequence stays behind a manual tap in the web app.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[#575858]">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never sends outreach — save_draft is the closest tool, and it just leaves notes for you to review.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never deletes prospects, campaigns, or backlinks.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never changes your billing tier or issues refunds.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-brand-accent">&#10007;</span>
              <span>Never touches other users&apos; data — every tool is scoped to the caller.</span>
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-[#999999]">
          &copy; {new Date().getFullYear()} kinkylink
        </div>
      </footer>
    </div>
  )
}
