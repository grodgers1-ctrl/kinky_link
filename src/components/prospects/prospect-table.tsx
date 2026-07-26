"use client"
import { useState } from "react"
import { AddToCampaignDialog } from "./add-to-campaign-dialog"

export function ProspectTable({
  results,
  campaigns,
}: {
  results: any[]
  campaigns: { id: string; name: string }[]
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showDialog, setShowDialog] = useState(false)

  const toggle = (i: number) => {
    const next = new Set(selected)
    if (next.has(i)) { next.delete(i) } else { next.add(i) }
    setSelected(next)
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-brand-primary px-4 py-2">
          <span className="text-sm font-medium text-brand-secondary">
            {selected.size} selected
          </span>
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-lg bg-brand-secondary px-4 py-1.5 text-sm font-medium text-brand-white"
          >
            Add to Campaign
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#DCDDDE] bg-brand-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#DCDDDE] text-[#777777]">
              <th className="w-10 px-4 py-3"></th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">DA</th>
              <th className="px-4 py-3 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="border-b border-[#DCDDDE] text-brand-secondary last:border-0">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    className="h-4 w-4 accent-brand-secondary"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{r.domain}</td>
                <td className="max-w-xs truncate px-4 py-3">{r.title}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.domainAuthority != null
                        ? r.domainAuthority > 30
                          ? "bg-green-100 text-green-800"
                          : r.domainAuthority > 20
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-600"
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {r.domainAuthority ?? "—"}
                  </span>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-[#575858]">
                  {r.description || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDialog && (
        <AddToCampaignDialog
          count={selected.size}
          campaigns={campaigns}
          onConfirm={async (campaignId) => {
            const prospects = Array.from(selected).map((i) => results[i])
            await fetch("/api/prospects/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ campaignId, prospects }),
            })
            setSelected(new Set())
            setShowDialog(false)
          }}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  )
}
