"use client"
import { useState } from "react"

interface ErrorState {
  message: string
  detail?: string
}

export function ConnectSitePrompt() {
  const [loading, setLoading] = useState(false)
  const [sites, setSites] = useState<{ siteUrl: string }[]>([])
  const [error, setError] = useState<ErrorState | null>(null)

  const connectSites = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/sites")
      const data = await res.json()
      if (!res.ok) {
        setError({ message: data.error || "Failed to connect", detail: data.detail })
        return
      }
      setSites(data.sites || [])
    } catch {
      setError({ message: "Network error. Please try again." })
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
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-brand-accent">{error.message}</p>
          {error.detail && (
            <p className="text-xs text-[#575858]">{error.detail}</p>
          )}
        </div>
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
