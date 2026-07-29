"use client"
import { useState } from "react"

const CLIENTS = [
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    file: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\\Claude\\claude_desktop_config.json (Windows)",
    snippet: (origin: string) =>
      JSON.stringify(
        {
          mcpServers: {
            linklight: {
              url: `${origin}/api/mcp`,
              headers: { Authorization: "Bearer sk_ll_PASTE_YOUR_KEY_HERE" },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "claude-code",
    label: "Claude Code",
    file: "~/.claude/settings.json (add under mcpServers)",
    snippet: (origin: string) =>
      JSON.stringify(
        {
          mcpServers: {
            linklight: {
              type: "http",
              url: `${origin}/api/mcp`,
              headers: { Authorization: "Bearer sk_ll_PASTE_YOUR_KEY_HERE" },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: "cursor",
    label: "Cursor",
    file: "~/.cursor/mcp.json",
    snippet: (origin: string) =>
      JSON.stringify(
        {
          mcpServers: {
            linklight: {
              url: `${origin}/api/mcp`,
              headers: { Authorization: "Bearer sk_ll_PASTE_YOUR_KEY_HERE" },
            },
          },
        },
        null,
        2,
      ),
  },
]

export function McpSetupSnippets({ origin }: { origin: string }) {
  const [active, setActive] = useState(CLIENTS[0].id)
  const current = CLIENTS.find((c) => c.id === active)!
  const snippet = current.snippet(origin)

  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white">
      <div className="flex border-b border-[#DCDDDE]">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-4 py-3 text-sm font-medium ${
              c.id === active
                ? "border-b-2 border-brand-accent text-brand-secondary"
                : "text-[#575858] hover:text-brand-secondary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        <p className="text-xs text-[#575858]">Add this to your config file:</p>
        <p className="mt-1 font-mono text-xs text-[#999999]">{current.file}</p>
        <div className="mt-3 flex items-start gap-2">
          <pre className="flex-1 overflow-x-auto rounded bg-brand-surface p-4 font-mono text-xs text-brand-secondary">
            {snippet}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(snippet)}
            className="rounded-lg bg-brand-secondary px-3 py-2 text-xs font-medium text-brand-white hover:bg-[#1f0066]"
          >
            Copy
          </button>
        </div>
        <p className="mt-3 text-xs text-[#575858]">
          Replace <code>sk_ll_PASTE_YOUR_KEY_HERE</code> with a key from above. Restart
          your client after editing the config.
        </p>
      </div>
    </div>
  )
}
