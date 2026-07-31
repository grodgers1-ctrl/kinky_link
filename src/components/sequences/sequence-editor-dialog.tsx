"use client"
import { useState } from "react"

interface StepDraft {
  delayDays: number
  subject: string
  bodyHtml: string
  bodyText: string
}

const EMPTY_STEP: StepDraft = { delayDays: 3, subject: "", bodyHtml: "", bodyText: "" }

export function SequenceEditorDialog({
  campaigns,
  onClose,
  onCreated,
}: {
  campaigns: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState("")
  const [campaignId, setCampaignId] = useState("")
  const [steps, setSteps] = useState<StepDraft[]>([{ ...EMPTY_STEP, delayDays: 0 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const addStep = () => setSteps((cur) => [...cur, { ...EMPTY_STEP }])
  const removeStep = (i: number) => setSteps((cur) => cur.filter((_, idx) => idx !== i))
  const updateStep = (i: number, patch: Partial<StepDraft>) =>
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const submit = async () => {
    setError("")
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    if (steps.length === 0 || steps.some((s) => !s.subject.trim() || !s.bodyHtml.trim())) {
      setError("Each step needs a subject and body")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          campaignId: campaignId || null,
          steps,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to create sequence")
        setSaving(false)
        return
      }
      onCreated()
    } catch {
      setError("Network error")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-brand-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#DCDDDE] px-6 py-4">
          <h2 className="text-h3 font-bold text-brand-secondary">New sequence</h2>
          <button
            onClick={onClose}
            className="text-sm text-[#777777] hover:text-brand-secondary"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          <div>
            <label className="text-sm font-medium text-[#575858]">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 follow-up"
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-brand-secondary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#575858]">Campaign (optional)</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm text-brand-secondary"
            >
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-4">
            {steps.map((s, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#DCDDDE] bg-brand-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-brand-secondary">
                    Step {i + 1}
                  </p>
                  {steps.length > 1 && (
                    <button
                      onClick={() => removeStep(i)}
                      className="text-xs text-brand-accent hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-3">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#777777]">
                      Wait days after previous step
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={s.delayDays}
                      onChange={(e) =>
                        updateStep(i, { delayDays: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="mt-1 w-24 rounded border border-[#CCCCCD] px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#777777]">
                      Subject
                    </label>
                    <input
                      value={s.subject}
                      onChange={(e) => updateStep(i, { subject: e.target.value })}
                      className="mt-1 w-full rounded border border-[#CCCCCD] px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[#777777]">
                      Body (HTML)
                    </label>
                    <textarea
                      value={s.bodyHtml}
                      onChange={(e) => updateStep(i, { bodyHtml: e.target.value, bodyText: e.target.value.replace(/<[^>]+>/g, "") })}
                      className="mt-1 min-h-[100px] w-full rounded border border-[#CCCCCD] p-2 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addStep}
              className="w-full rounded-lg border border-dashed border-[#CCCCCD] py-2 text-sm text-[#575858] hover:border-brand-accent hover:text-brand-accent"
            >
              + Add step
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-3 text-sm text-brand-accent">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#DCDDDE] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#CCCCCD] px-4 py-2 text-sm text-[#575858] hover:bg-brand-surface"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066] disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create sequence"}
          </button>
        </div>
      </div>
    </div>
  )
}
