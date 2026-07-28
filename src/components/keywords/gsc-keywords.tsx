"use client"
import { useEffect, useState } from "react"

export function GscKeywords({ sites }: { sites: { id: string; url: string }[] }) {
  const [keywords, setKeywords] = useState<any[]>([])
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || "")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedSite) return
    setLoading(true)
    fetch(`/api/keywords/gsc?siteId=${selectedSite}`)
      .then(r => r.json())
      .then(d => { setKeywords(d.keywords || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedSite])

  if (sites.length === 0) {
    return <p className="text-sm text-[#575858]">Connect a site to see GSC keyword data.</p>
  }

  return (
    <div className="space-y-4">
      <select
        value={selectedSite}
        onChange={e => setSelectedSite(e.target.value)}
        className="rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-[#575858]"
      >
        {sites.map(s => <option key={s.id} value={s.id}>{s.url}</option>)}
      </select>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ) : keywords.length === 0 ? (
        <p className="text-sm text-[#575858]">No keyword data from GSC yet. Sync your site first.</p>
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
              {keywords.map((kw: any, i: number) => (
                <tr key={i} className="hover:bg-brand-surface">
                  <td className="px-4 py-3 text-sm font-medium text-brand-secondary">{kw.keyword}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.clicks}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.impressions}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{(kw.ctr * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-sm text-[#575858]">{kw.avgPosition.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => fetch("/api/keywords", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ keyword: kw.keyword, siteId: selectedSite, source: "gsc" }),
                      }).then(() => { /* silently save */ })}
                      className="text-xs text-blue-600 hover:underline"
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
