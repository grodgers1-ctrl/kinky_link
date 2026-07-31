"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

interface CampaignProspect {
  id: string
  url: string
  domain: string | null
  title: string | null
  status: string
  email: string | null
  tags: string[]
}

interface SequenceOption {
  id: string
  name: string
}

export function CampaignProspectsTable({
  prospects,
  sequences,
}: {
  prospects: CampaignProspect[]
  sequences: SequenceOption[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tagInput, setTagInput] = useState("")
  const [sequenceId, setSequenceId] = useState("")
  const [busy, setBusy] = useState<null | "delete" | "tag" | "enroll">(null)
  const [error, setError] = useState("")

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === prospects.length) setSelected(new Set())
    else setSelected(new Set(prospects.map((p) => p.id)))
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} prospect(s)?`)) return
    setBusy("delete")
    setError("")
    try {
      for (const id of selected) {
        await fetch(`/api/prospects?id=${id}`, { method: "DELETE" })
      }
      setSelected(new Set())
      router.refresh()
    } catch {
      setError("Delete failed")
    } finally {
      setBusy(null)
    }
  }

  const tagSelected = async () => {
    if (selected.size === 0 || !tagInput.trim()) return
    setBusy("tag")
    setError("")
    try {
      for (const id of selected) {
        const p = prospects.find((p) => p.id === id)
        const tags = [...(p?.tags || []), tagInput.trim()]
        await fetch("/api/prospects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, tags }),
        })
      }
      setTagInput("")
      setSelected(new Set())
      router.refresh()
    } catch {
      setError("Tag failed")
    } finally {
      setBusy(null)
    }
  }

  const enrollSelected = async () => {
    if (selected.size === 0 || !sequenceId) return
    setBusy("enroll")
    setError("")
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Enroll failed")
        return
      }
      setSelected(new Set())
      setSequenceId("")
      router.refresh()
    } catch {
      setError("Enroll failed")
    } finally {
      setBusy(null)
    }
  }

  if (prospects.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-[#DCDDDE] bg-brand-white p-6 text-center text-sm text-[#575858]">
        No prospects in this campaign.
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-primary px-4 py-2">
          <span className="text-sm font-medium text-brand-secondary">
            {selected.size} selected
          </span>

          <div className="flex items-center gap-2">
            <input
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tagSelected()}
              className="rounded border border-[#CCCCCD] bg-white px-2 py-1 text-sm"
            />
            <button
              onClick={tagSelected}
              disabled={busy === "tag" || !tagInput.trim()}
              className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white disabled:opacity-50"
            >
              {busy === "tag" ? "…" : "Apply tag"}
            </button>
          </div>

          {sequences.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={sequenceId}
                onChange={(e) => setSequenceId(e.target.value)}
                className="rounded border border-[#CCCCCD] bg-white px-2 py-1 text-sm"
              >
                <option value="">Sequence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={enrollSelected}
                disabled={busy === "enroll" || !sequenceId}
                className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white disabled:opacity-50"
              >
                {busy === "enroll" ? "…" : "Enroll"}
              </button>
            </div>
          )}

          <button
            onClick={deleteSelected}
            disabled={busy === "delete"}
            className="ml-auto rounded border border-brand-accent px-3 py-1 text-xs font-medium text-brand-accent hover:bg-[#FFF0F2] disabled:opacity-50"
          >
            {busy === "delete" ? "…" : `Delete ${selected.size}`}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-3 text-sm text-brand-accent">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#DCDDDE] bg-brand-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#DCDDDE] text-[#777777]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === prospects.length && prospects.length > 0}
                  onChange={toggleAll}
                  className="accent-brand-secondary"
                />
              </th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[#DCDDDE] text-brand-secondary last:border-0"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-brand-secondary"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{p.domain || p.url}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-brand-primary px-2 py-0.5 text-xs text-brand-secondary">
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#575858]">{p.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
