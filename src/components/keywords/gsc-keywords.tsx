"use client"
import { useEffect, useMemo, useState } from "react"

interface Keyword {
  keyword: string
  clicks: number
  impressions: number
  ctr: number
  avgPosition: number
}

type SortMode = "opportunity" | "impressions" | "position" | "alphabetical"
type FilterMode = "all" | "quickWins"

function opportunityScore(k: Keyword): number {
  return k.impressions * (1 / Math.max(k.avgPosition, 1))
}

function sortKeywords(keywords: Keyword[], mode: SortMode): Keyword[] {
  const copy = [...keywords]
  switch (mode) {
    case "opportunity":
      return copy.sort((a, b) => opportunityScore(b) - opportunityScore(a))
    case "impressions":
      return copy.sort((a, b) => b.impressions - a.impressions)
    case "position":
      return copy.sort((a, b) => a.avgPosition - b.avgPosition)
    case "alphabetical":
      return copy.sort((a, b) => a.keyword.localeCompare(b.keyword))
  }
}

function filterKeywords(keywords: Keyword[], mode: FilterMode): Keyword[] {
  if (mode === "quickWins") {
    return keywords.filter(
      (k) => k.avgPosition >= 11 && k.avgPosition <= 30 && k.impressions > 0,
    )
  }
  return keywords
}

export function GscKeywords({ sites }: { sites: { id: string; url: string }[] }) {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || "")
  const [loading, setLoading] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>("opportunity")
  const [filterMode, setFilterMode] = useState<FilterMode>("all")

  useEffect(() => {
    if (!selectedSite) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/keywords/gsc?siteId=${selectedSite}`)
        const d = await res.json()
        if (!cancelled) setKeywords(d.keywords || [])
      } catch {
        // ignore — leave keywords as-is
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedSite])

  const rows = useMemo(
    () => sortKeywords(filterKeywords(keywords, filterMode), sortMode),
    [keywords, sortMode, filterMode],
  )

  if (sites.length === 0) {
    return <p className="text-sm text-[#575858]">Connect a site to see GSC keyword data.</p>
  }

  const chipBase = "rounded-full px-3 py-1 text-xs font-medium transition-colors"
  const chipActive = "bg-brand-secondary text-brand-white"
  const chipIdle = "bg-brand-surface text-[#575858] hover:bg-[#DCDDDE]"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSite}
          onChange={(e) => setSelectedSite(e.target.value)}
          className="rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-[#575858]"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.url}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 border-l border-[#DCDDDE] pl-3">
          <span className="text-xs uppercase tracking-wider text-[#999999]">Show</span>
          <button
            onClick={() => setFilterMode("all")}
            className={`${chipBase} ${filterMode === "all" ? chipActive : chipIdle}`}
          >
            All
          </button>
          <button
            onClick={() => setFilterMode("quickWins")}
            className={`${chipBase} ${filterMode === "quickWins" ? chipActive : chipIdle}`}
            title="Position 11-30 with impressions — striking distance of page 1"
          >
            Quick Wins
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-[#DCDDDE] pl-3">
          <span className="text-xs uppercase tracking-wider text-[#999999]">Sort</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-lg border border-[#CCCCCD] px-2 py-1 text-xs text-[#575858]"
          >
            <option value="opportunity">Opportunity</option>
            <option value="impressions">Impressions</option>
            <option value="position">Position</option>
            <option value="alphabetical">A-Z</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[#575858]">
          {keywords.length === 0
            ? "No keyword data from GSC yet. Sync your site first."
            : "No keywords match the current filter."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#DCDDDE]">
          <table className="min-w-full divide-y divide-[#DCDDDE]">
            <thead className="bg-brand-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Query</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Clicks</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Impressions</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">CTR</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Position</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-[#777777]">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCDDDE] bg-white">
              {rows.map((kw, i) => (
                <tr key={i} className="hover:bg-brand-surface">
                  <td className="px-4 py-3 text-sm font-medium text-brand-secondary">{kw.keyword}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.clicks}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.impressions}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">
                    {(kw.ctr * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">
                    {kw.avgPosition.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() =>
                        fetch("/api/keywords", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            keyword: kw.keyword,
                            siteId: selectedSite,
                            source: "gsc",
                          }),
                        }).catch(() => {})
                      }
                      className="text-xs text-brand-accent hover:underline"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
