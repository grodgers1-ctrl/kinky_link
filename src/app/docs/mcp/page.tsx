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
          <pre className="mt-3 overflow-x-auto rounded bg-brand-white p-4 font-mono text-xs text-brand-secondary">
{`Find the top 10 prospects for "nextjs seo" with DA ≥ 40.
For each, draft a warm personalized email referencing their most recent post,
save each draft against the prospect, and show me the spam scores.`}
          </pre>
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
