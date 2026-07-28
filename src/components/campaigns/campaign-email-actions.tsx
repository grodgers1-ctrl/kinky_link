"use client"
import { useState } from "react"

export function CampaignEmailActions({ campaignId }: { campaignId: string }) {
  const [finding, setFinding] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleFindAll = async () => {
    setFinding(true)
    setResult(null)
    try {
      const res = await fetch("/api/prospects/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json()
      const found = data.results?.filter((r: any) => r.email).length || 0
      setResult(`Found ${found} email(s)`)
    } catch {
      setResult("Failed to find emails")
    }
    setFinding(false)
  }

  const handleVerifyAll = async () => {
    setVerifying(true)
    setResult(null)
    try {
      const res = await fetch(`/api/prospects?campaignId=${campaignId}`)
      const { prospects } = await res.json()
      const ids = (prospects || []).filter((p: any) => p.email).map((p: any) => p.id)
      if (ids.length === 0) {
        setResult("No emails to verify")
        setVerifying(false)
        return
      }
      const vres = await fetch("/api/prospects/verify-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: ids }),
      })
      const vdata = await vres.json()
      setResult(`Verified ${vdata.verified}/${vdata.total} emails`)
    } catch {
      setResult("Failed to verify emails")
    }
    setVerifying(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleFindAll}
        disabled={finding}
        className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {finding ? "Finding..." : "Find All Emails"}
      </button>
      <button
        onClick={handleVerifyAll}
        disabled={verifying}
        className="rounded-lg border border-[#DCDDDE] bg-white px-4 py-2 text-sm font-medium text-[#575858] hover:bg-brand-surface disabled:opacity-50"
      >
        {verifying ? "Verifying..." : "Verify All"}
      </button>
      {result && (
        <span className="text-sm text-[#575858]">{result}</span>
      )}
    </div>
  )
}
