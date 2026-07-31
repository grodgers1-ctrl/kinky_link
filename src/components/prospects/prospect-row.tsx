"use client"
import { useState } from "react"
import type { Prospect } from "@/types"

const statusColors: Record<string, string> = {
  prospect: "bg-gray-100 text-gray-600",
  contacted: "bg-blue-100 text-blue-700",
  replied: "bg-yellow-100 text-yellow-700",
  live_link: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  archived: "bg-zinc-100 text-zinc-500",
}

function DABadge({ da, isFallback }: { da: number | null | undefined; isFallback: boolean }) {
  if (da == null) return <span className="text-xs text-[#999999]">—</span>
  const color = da > 30 ? "bg-green-100 text-green-700" : da > 20 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
      title={isFallback ? "Derived from domain_facts cache" : undefined}
    >
      {da}
      {isFallback && <span className="ml-1 opacity-60">·</span>}
    </span>
  )
}

export function ProspectRow({
  prospect,
  campaigns,
  onUpdated,
}: {
  prospect: Prospect
  campaigns: { id: string; name: string }[]
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(prospect.title || "")
  const [saving, setSaving] = useState(false)
  const [findingEmail, setFindingEmail] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const handleFindEmail = async () => {
    setFindingEmail(true)
    try {
      const res = await fetch("/api/prospects/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: [prospect.id] }),
      })
      if (res.ok) onUpdated()
    } catch {
      // silently handle
    }
    setFindingEmail(false)
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const res = await fetch("/api/prospects/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: prospect.id, email: prospect.email }),
      })
      if (res.ok) onUpdated()
    } catch {
      // silently handle
    }
    setVerifying(false)
  }

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true)
    try {
      await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: prospect.id, ...updates }),
      })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm("Delete this prospect?")) return
    setSaving(true)
    try {
      await fetch(`/api/prospects?id=${prospect.id}`, { method: "DELETE" })
      onUpdated()
    } finally {
      setSaving(false)
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
          <span
            onClick={() => !saving && setEditing(true)}
            title={prospect.homepageDescription || undefined}
            className="cursor-pointer hover:text-brand-accent"
          >
            {prospect.title || prospect.homepageTitle || "—"}
            {!prospect.title && prospect.homepageTitle && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-[#999999]">cache</span>
            )}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <DABadge
          da={prospect.resolvedDA ?? prospect.domain_authority}
          isFallback={prospect.domain_authority == null && prospect.resolvedDA != null}
        />
      </td>
      <td className="px-4 py-3">
        {(prospect.email || prospect.resolvedEmail) ? (
          <span className="flex items-center gap-1">
            <span className="truncate text-sm">
              {prospect.email || prospect.resolvedEmail}
            </span>
            {!prospect.email && prospect.resolvedEmail && (
              <span className="rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] text-brand-secondary" title="Shared cache — click Find Email to persist on this prospect">
                cache
              </span>
            )}
            {prospect.email_verified ? (
              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">&#10003;</span>
            ) : prospect.email ? (
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="shrink-0 text-xs text-yellow-600 hover:underline disabled:opacity-50"
              >
                {verifying ? "..." : "Verify"}
              </button>
            ) : null}
          </span>
        ) : (
          <button
            onClick={handleFindEmail}
            disabled={findingEmail}
            className="text-xs text-brand-accent hover:underline disabled:opacity-50"
          >
            {findingEmail ? "Searching..." : "Find Email"}
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[prospect.status] || statusColors.prospect}`}>
          {prospect.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(prospect.tags || []).map((t, i) => (
            <span key={i} className="inline-block rounded-full bg-brand-primary px-2 py-0.5 text-xs text-brand-secondary">{t}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#575858]">
        {campaigns.find((c) => c.id === prospect.campaign_id)?.name || "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button onClick={() => setEditing(!editing)} disabled={saving} className="text-xs text-[#777777] hover:text-brand-secondary">
            {saving ? "..." : "Edit"}
          </button>
          <button onClick={remove} disabled={saving} className="text-xs text-brand-accent hover:text-red-700">Delete</button>
        </div>
      </td>
    </tr>
  )
}
