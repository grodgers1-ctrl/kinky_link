"use client"
import { useState } from "react"

export function ConnectSitePrompt() {
  const [loading, setLoading] = useState(false)
  const [sites, setSites] = useState<{ siteUrl: string }[]>([])
  const [error, setError] = useState("")

  const connectSites = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/sites")
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to connect")
        return
      }
      setSites(data.sites || [])
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center">
      <h2 className="text-h3 font-bold text-brand-secondary">
        Connect Your Site
      </h2>
      <p className="mt-2 text-body text-[#575858]">
        Link your Google Search Console account to start tracking performance.
      </p>

      {error && (
        <p className="mt-3 text-sm text-brand-accent">{error}</p>
      )}

      <button
        onClick={connectSites}
        disabled={loading}
        className="mt-4 rounded-lg bg-brand-secondary px-6 py-2 text-body font-medium text-brand-white transition-colors hover:bg-[#1f0066] disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Connect from Google Search Console"}
      </button>

      {sites.length > 0 && (
        <div className="mt-6 text-left">
          <h3 className="text-sm font-medium text-brand-secondary">Connected Sites</h3>
          <ul className="mt-2 space-y-1">
            {sites.map((site) => (
              <li key={site.siteUrl} className="text-sm text-[#575858]">
                {site.siteUrl}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
