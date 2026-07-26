"use client"
import { useState } from "react"

const statusColors: Record<string, string> = {
  prospect: "bg-gray-100 text-gray-600",
  contacted: "bg-blue-100 text-blue-700",
  replied: "bg-yellow-100 text-yellow-700",
  live_link: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  archived: "bg-zinc-100 text-zinc-500",
}

function DABadge({ da }: { da: number | null }) {
  if (da == null) return <span className="text-xs text-[#999999]">—</span>
  const color = da > 30 ? "bg-green-100 text-green-700" : da > 20 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{da}</span>
}

export function ProspectRow({
  prospect,
  campaigns,
  onUpdated,
}: {
  prospect: any
  campaigns: { id: string; name: string }[]
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(prospect.title || "")
  const [editNotes, setEditNotes] = useState(prospect.notes || "")

  const save = async (updates: Record<string, any>) => {
    await fetch("/api/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospect.id, ...updates }),
    })
    onUpdated()
  }

  const remove = async () => {
    if (confirm("Delete this prospect?")) {
      await fetch(`/api/prospects?id=${prospect.id}`, { method: "DELETE" })
      onUpdated()
    }
  }

  return (
    <tr className="border-b border-[#DCDDDE] text-brand-secondary last:border-0">
      <td className="px-4 py-3">
        <a href={prospect.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-secondary hover:text-brand-accent">
          {prospect.domain || prospect.url}
        </a>
      </td>
      <td className="max-w-xs truncate px-4 py-3">
        {editing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => { save({ title: editTitle }); setEditing(false) }}
            onKeyDown={(e) => e.key === "Enter" && (document.activeElement as HTMLElement)?.blur()}
            className="w-full rounded border border-[#CCCCCD] px-2 py-1 text-sm"
            autoFocus
          />
        ) : (
          <span onClick={() => setEditing(true)} className="cursor-pointer hover:text-brand-accent">
            {prospect.title || "—"}
          </span>
        )}
      </td>
      <td className="px-4 py-3"><DABadge da={prospect.domain_authority} /></td>
      <td className="px-4 py-3">{prospect.email || "—"}</td>
      <td className="px-4 py-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[prospect.status] || statusColors.prospect}`}>
          {prospect.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(prospect.tags || []).map((t: string, i: number) => (
            <span key={i} className="inline-block rounded-full bg-brand-primary px-2 py-0.5 text-xs text-brand-secondary">{t}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#575858]">
        {campaigns.find((c) => c.id === prospect.campaign_id)?.name || "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} className="text-xs text-[#777777] hover:text-brand-secondary">Edit</button>
          <button onClick={remove} className="text-xs text-brand-accent hover:text-red-700">Delete</button>
        </div>
      </td>
    </tr>
  )
}
