"use client"
import { useState } from "react"

export function SyncButton() {
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch("/api/backlinks/sync", { method: "POST" })
      window.location.reload()
    } catch {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {syncing ? "Syncing..." : "Sync Now"}
    </button>
  )
}
