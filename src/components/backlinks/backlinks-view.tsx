"use client"
import { useEffect, useState } from "react"
import { BacklinksTable } from "./backlinks-table"
import { BacklinksSummary } from "./backlinks-summary"

export function BacklinksView({ sites }: { sites: { id: string; url: string }[] }) {
  const [backlinks, setBacklinks] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [selectedSite, setSelectedSite] = useState<string>("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const fetchBacklinks = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedSite) params.set("siteId", selectedSite)
    if (search) params.set("search", search)

    const res = await fetch(`/api/backlinks?${params}`)
    const data = await res.json()
    setBacklinks(data.backlinks || [])
    setSummary(data.summary || null)
    setLoading(false)
  }

  useEffect(() => { fetchBacklinks() }, [selectedSite])

  return (
    <div className="space-y-6">
      {summary && <BacklinksSummary summary={summary} />}

      <div className="flex gap-4">
        <select
          value={selectedSite}
          onChange={e => setSelectedSite(e.target.value)}
          className="rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-[#575858]"
        >
          <option value="">All Sites</option>
          {sites.map(site => (
            <option key={site.id} value={site.id}>{site.url}</option>
          ))}
        </select>
        <input
          placeholder="Search source URL..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchBacklinks()}
          className="flex-1 rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm placeholder-[#999999]"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : (
        <BacklinksTable backlinks={backlinks} onRefresh={fetchBacklinks} />
      )}
    </div>
  )
}
