import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { listKeys } from "@/lib/api-keys"
import { ApiKeyManager } from "@/components/settings/api-key-manager"
import { McpSetupSnippets } from "@/components/settings/mcp-setup-snippets"

export default async function ApiAccessPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const keys = await listKeys(session.user.id)

  const h = await headers()
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
  const proto = h.get("x-forwarded-proto") || "https"
  const origin = `${proto}://${host}`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-h2 font-bold text-brand-secondary">API Access</h1>
        <p className="mt-2 max-w-2xl text-body text-[#575858]">
          Connect linklight to your AI agent via MCP. Any MCP-compatible client works —
          Claude Desktop, Claude Code, Cursor, Windsurf. Your agent can search prospects,
          draft emails, and prepare campaigns for you to review. Sending stays behind a
          manual tap.
        </p>
      </div>

      <ApiKeyManager initialKeys={keys} />

      <div>
        <h2 className="text-h3 font-bold text-brand-secondary">Client setup</h2>
        <p className="mt-2 text-sm text-[#575858]">
          Pick your client and paste the snippet into its MCP config.
        </p>
        <div className="mt-4">
          <McpSetupSnippets origin={origin} />
        </div>
      </div>
    </div>
  )
}
