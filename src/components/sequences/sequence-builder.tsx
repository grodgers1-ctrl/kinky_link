"use client"
import { useState } from "react"

interface Step {
  delayDays: number
  subject: string
  bodyHtml: string
  bodyText: string
}

export function SequenceBuilder({
  campaignId,
  templates,
  prospects,
  onSave,
}: {
  campaignId: string
  templates: { id: string; name: string; subject: string; body_html: string; body_text: string }[]
  prospects: { id: string; domain?: string | null; url: string; email?: string | null }[]
  onSave: (data: { campaignId: string; name: string; steps: Step[]; prospectIds: string[] }) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [steps, setSteps] = useState<Step[]>([
    { delayDays: 0, subject: "", bodyHtml: "", bodyText: "" },
    { delayDays: 3, subject: "", bodyHtml: "", bodyText: "" },
    { delayDays: 7, subject: "", bodyHtml: "", bodyText: "" },
    { delayDays: 14, subject: "", bodyHtml: "", bodyText: "" },
  ])
  const [selectedProspects, setSelectedProspects] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const updateStep = (index: number, field: string, value: string | number) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const handleSave = async () => {
    if (!name) return
    setSaving(true)
    try { await onSave({ campaignId, name, steps, prospectIds: selectedProspects }) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <input
        placeholder="Sequence name (e.g. 'Blogger Outreach Drip')"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-4 py-3 text-lg text-brand-secondary placeholder:text-[#999999]"
      />

      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={i} className="relative rounded-xl border border-[#DCDDDE] bg-brand-white p-4">
            {i > 0 && <div className="absolute -top-4 left-8 h-4 w-px bg-[#CCCCCD]" />}

            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-sm font-medium text-brand-secondary">
                {i === 0 ? "1" : `+${step.delayDays}d`}
              </div>
              <div className="flex-1">
                <input
                  placeholder="Subject line"
                  value={step.subject}
                  onChange={(e) => updateStep(i, "subject", e.target.value)}
                  className="w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm font-medium text-brand-secondary placeholder:text-[#999999]"
                />
              </div>
              <select
                value={step.delayDays}
                onChange={(e) => updateStep(i, "delayDays", parseInt(e.target.value))}
                className="rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary"
              >
                <option value={0}>Send immediately</option>
                <option value={1}>1 day later</option>
                <option value={2}>2 days later</option>
                <option value={3}>3 days later</option>
                <option value={5}>5 days later</option>
                <option value={7}>7 days later</option>
                <option value={10}>10 days later</option>
                <option value={14}>14 days later</option>
              </select>
            </div>

            <textarea
              placeholder="Email body..."
              value={step.bodyHtml}
              onChange={(e) => updateStep(i, "bodyHtml", e.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-lg border border-[#CCCCCD] bg-brand-white p-3 font-mono text-sm text-brand-secondary placeholder:text-[#999999]"
            />

            <div className="mt-2 flex gap-2">
              <select
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value)
                  if (t) {
                    updateStep(i, "subject", t.subject)
                    updateStep(i, "bodyHtml", t.body_html)
                    updateStep(i, "bodyText", t.body_text)
                  }
                }}
                className="rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-1 text-xs text-brand-secondary"
                defaultValue=""
              >
                <option value="" disabled>Load from template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setSteps((prev) => [...prev, { delayDays: 7, subject: "", bodyHtml: "", bodyText: "" }])}
        className="text-sm text-brand-accent hover:underline"
      >
        + Add follow-up step
      </button>

      <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-4">
        <h3 className="font-medium text-brand-secondary">Select Prospects</h3>
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {prospects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-[#575858]">
              <input
                type="checkbox"
                checked={selectedProspects.includes(p.id)}
                onChange={(e) => {
                  if (e.target.checked) setSelectedProspects((prev) => [...prev, p.id])
                  else setSelectedProspects((prev) => prev.filter((id) => id !== p.id))
                }}
                className="accent-brand-secondary"
              />
              {p.domain || p.url} {p.email && `(${p.email})`}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name}
        className="rounded-lg bg-brand-secondary px-6 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Sequence"}
      </button>
    </div>
  )
}
