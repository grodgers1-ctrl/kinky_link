"use client"
import { useState } from "react"

export function AddToCampaignDialog({
  count,
  campaigns,
  onConfirm,
  onClose,
}: {
  count: number
  campaigns: { id: string; name: string }[]
  onConfirm: (campaignId: string) => Promise<void>
  onClose: () => void
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || "")
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!campaignId) return
    setSaving(true)
    try { await onConfirm(campaignId) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-brand-white p-6 shadow-lg">
        <h2 className="text-h3 font-bold text-brand-secondary">
          Add {count} prospect{count > 1 ? "s" : ""}
        </h2>

        <div className="mt-4">
          <label className="text-sm font-medium text-[#575858]">Campaign</label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary focus:outline-none focus:ring-2 focus:ring-brand-secondary"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#CCCCCD] px-4 py-2 text-sm font-medium text-[#575858] hover:bg-brand-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !campaignId}
            className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  )
}
