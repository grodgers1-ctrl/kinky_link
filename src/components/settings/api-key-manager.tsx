"use client"
import { useState } from "react"
import type { ApiKeyRow } from "@/lib/api-keys"

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setNewKey(data.raw)
      setKeys((k) => [data.row, ...k])
      setName("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Any agent using it will lose access immediately.")) return
    const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" })
    if (res.ok) {
      setKeys((k) =>
        k.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)),
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-5">
        <h2 className="text-h3 font-semibold text-brand-secondary">Create a new key</h2>
        <p className="mt-1 text-sm text-[#575858]">
          Name it after where you&apos;ll use it, e.g. &quot;Claude Desktop&quot;.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude Desktop"
            className="flex-1 rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066] disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create key"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-brand-accent">{error}</p>}
      </div>

      {newKey && (
        <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-5">
          <h3 className="font-semibold text-brand-accent">Copy this key now.</h3>
          <p className="mt-1 text-sm text-[#575858]">
            This is the only time it will be shown. Store it somewhere safe.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-brand-white px-3 py-2 font-mono text-xs text-brand-secondary">
              {newKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(newKey)}
              className="rounded-lg bg-brand-secondary px-3 py-2 text-xs font-medium text-brand-white hover:bg-[#1f0066]"
            >
              Copy
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="rounded-lg border border-[#DCDDDE] px-3 py-2 text-xs text-[#575858]"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#DCDDDE] bg-brand-white">
        <div className="border-b border-[#DCDDDE] px-5 py-3">
          <h2 className="text-h3 font-semibold text-brand-secondary">Your keys</h2>
        </div>
        {keys.length === 0 ? (
          <p className="p-5 text-sm text-[#575858]">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-[#DCDDDE]">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-brand-secondary">
                    {k.name}
                    {k.revoked_at && (
                      <span className="ml-2 rounded bg-[#FFE4E6] px-2 py-0.5 text-xs text-brand-accent">
                        revoked
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[#999999]">
                    {k.key_prefix}… &middot; created{" "}
                    {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at
                      ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}`
                      : " · never used"}
                  </p>
                </div>
                {!k.revoked_at && (
                  <button
                    onClick={() => revoke(k.id)}
                    className="text-sm text-brand-accent hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
