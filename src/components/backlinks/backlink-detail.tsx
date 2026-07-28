"use client"
import { useState } from "react"
import { HealthBadge } from "./health-badge"
import { HealthTimeline } from "./health-timeline"
import { DestinationHealthCheck } from "./destination-health-check"

export function BacklinkDetail({ backlink }: { backlink: any }) {
  const [healthStatus, setHealthStatus] = useState(backlink.health_status)
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthResult, setHealthResult] = useState<any>(null)

  const [indexed, setIndexed] = useState<boolean | null>(backlink.is_indexed)
  const [indexLoading, setIndexLoading] = useState(false)

  const checkHealth = async () => {
    setHealthLoading(true)
    try {
      const res = await fetch(`/api/backlinks/${backlink.id}/check-health`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setHealthStatus(data.healthStatus)
        setHealthResult(data)
      }
    } catch {
      // errors handled silently — loading state resets below
    } finally {
      setHealthLoading(false)
    }
  }

  const checkIndex = async () => {
    setIndexLoading(true)
    try {
      const res = await fetch(`/api/backlinks/${backlink.id}/check-index`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setIndexed(data.indexed)
      }
    } catch {
      // errors handled silently — loading state resets below
    } finally {
      setIndexLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-bold text-brand-secondary">Backlink Detail</h1>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-[#DCDDDE] bg-white p-4">
          <h3 className="text-sm font-medium text-[#777777]">Source URL Health</h3>
          <div className="mt-2 flex items-center gap-2">
            <HealthBadge status={healthStatus} />
            <span className="text-sm text-[#999999]">
              Last checked: {backlink.last_health_check ? new Date(backlink.last_health_check).toLocaleDateString() : "Never"}
            </span>
          </div>
          <a href={backlink.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm text-blue-600 hover:underline">
            {backlink.source_url}
          </a>
          <button
            onClick={checkHealth}
            disabled={healthLoading}
            className="mt-3 rounded bg-brand-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {healthLoading ? "Checking..." : "Check Health Now"}
          </button>
          {healthResult && (
            <div className="mt-2 space-y-1 text-xs text-[#575858]">
              <p>Source: {healthResult.sourceCheck?.statusCode ?? "unreachable"}</p>
              <p>Target: {healthResult.targetCheck?.statusCode ?? "unreachable"}</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#DCDDDE] bg-white p-4">
          <h3 className="text-sm font-medium text-[#777777]">Destination URL Health</h3>
          <DestinationHealthCheck targetUrl={backlink.target_url} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border border-[#DCDDDE] bg-white p-4">
          <h3 className="text-sm font-medium text-[#777777]">Index Status</h3>
          <div className="mt-2">
            {indexed === true ? (
              <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Indexed</span>
            ) : indexed === false ? (
              <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Not Indexed</span>
            ) : (
              <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-[#575858]">Unknown</span>
            )}
          </div>
          <button
            onClick={checkIndex}
            disabled={indexLoading}
            className="mt-3 rounded border border-[#DCDDDE] bg-white px-3 py-1 text-xs font-medium text-[#575858] hover:bg-brand-surface disabled:opacity-50"
          >
            {indexLoading ? "Checking..." : "Check Index Status"}
          </button>
        </div>

        <div className="rounded-lg border border-[#DCDDDE] bg-white p-4">
          <h3 className="text-sm font-medium text-[#777777]">Details</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-[#999999]">Site</dt>
              <dd className="mt-1 text-[#575858]">{backlink.sites?.url || "\u2014"}</dd>
            </div>
            <div>
              <dt className="text-[#999999]">Anchor Text</dt>
              <dd className="mt-1 text-[#575858]">{backlink.anchor_text || "\u2014"}</dd>
            </div>
            <div>
              <dt className="text-[#999999]">First Seen</dt>
              <dd className="mt-1 text-[#575858]">{backlink.first_seen || "\u2014"}</dd>
            </div>
            <div>
              <dt className="text-[#999999]">Last Seen</dt>
              <dd className="mt-1 text-[#575858]">{backlink.last_seen || "\u2014"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <HealthTimeline backlinkId={backlink.id} />
    </div>
  )
}
