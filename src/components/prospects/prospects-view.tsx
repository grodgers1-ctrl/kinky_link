"use client"
import { useState, useEffect, useCallback } from "react"
import { ProspectRow } from "./prospect-row"

export function ProspectsView({
  campaigns,
}: {
  campaigns: { id: string; name: string }[]
}) {
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [campaignFilter, setCampaignFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [searchText, setSearchText] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagInput, setTagInput] = useState("")

  const fetchProspects = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (campaignFilter) params.set("campaignId", campaignFilter)
    if (statusFilter) params.set("status", statusFilter)
    if (searchText) params.set("search", searchText)
    const res = await fetch(`/api/prospects?${params}`)
    const data = await res.json()
    setProspects(data.prospects || [])
    setLoading(false)
  }, [campaignFilter, statusFilter, searchText])

  useEffect(() => { fetchProspects() }, [fetchProspects])

  const toggleAll = () => {
    if (selected.size === prospects.length) setSelected(new Set())
    else setSelected(new Set(prospects.map((p) => p.id)))
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) { next.delete(id) } else { next.add(id) }
    setSelected(next)
  }

  const applyTag = async () => {
    if (!tagInput.trim() || selected.size === 0) return
    for (const id of selected) {
      const p = prospects.find((p) => p.id === id)
      const tags = [...(p.tags || []), tagInput.trim()]
      await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tags }),
      })
    }
    setTagInput("")
    setSelected(new Set())
    fetchProspects()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary"
        >
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary"
        >
          <option value="">All statuses</option>
          {["prospect", "contacted", "replied", "live_link", "declined", "archived"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          placeholder="Search prospects..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1 rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary placeholder:text-[#999999]"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-brand-primary px-4 py-2">
          <span className="text-sm font-medium text-brand-secondary">{selected.size} selected</span>
          <input
            placeholder="Add tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyTag()}
            className="rounded border border-[#CCCCCD] bg-white px-2 py-1 text-sm"
          />
          <button onClick={applyTag} className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white">
            Apply Tag
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center text-sm text-[#777777]">
          Loading prospects...
        </div>
      ) : prospects.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#DCDDDE] bg-brand-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#DCDDDE] text-[#777777]">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={selected.size === prospects.length && prospects.length > 0} onChange={toggleAll} className="accent-brand-secondary" />
                </th>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">DA</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <ProspectRow
                  key={p.id}
                  prospect={p}
                  campaigns={campaigns}
                  onUpdated={fetchProspects}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center">
          <p className="text-body text-[#575858]">No prospects yet.</p>
          <p className="mt-1 text-sm text-[#999999]">Add your first prospects using the search tool.</p>
        </div>
      )}
    </div>
  )
}
