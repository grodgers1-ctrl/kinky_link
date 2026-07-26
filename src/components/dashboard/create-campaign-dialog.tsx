"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export function CreateCampaignDialog({ sites }: { sites: { id: string; url: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [siteId, setSiteId] = useState("")
  const [loading, setLoading] = useState(false)

  const create = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), siteId: siteId || undefined }),
      })
      if (res.ok) {
        setOpen(false)
        setName("")
        setSiteId("")
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white transition-colors hover:bg-[#1f0066]"
      >
        Create Campaign
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-brand-white p-6 shadow-lg">
            <h2 className="text-h3 font-bold text-brand-secondary">New Campaign</h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-[#575858]">Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Health guest posts"
                  className="mt-1 w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-brand-secondary"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#575858]">Site (optional)</label>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary"
                >
                  <option value="">No site</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.url}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[#CCCCCD] px-4 py-2 text-sm font-medium text-[#575858] hover:bg-brand-surface"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={loading || !name.trim()}
                className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white transition-colors hover:bg-[#1f0066] disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
