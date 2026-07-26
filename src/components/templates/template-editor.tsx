"use client"
import { useState } from "react"

const MERGE_TAGS = [
  { tag: "{{first_name}}", label: "First Name" },
  { tag: "{{company}}", label: "Company" },
  { tag: "{{domain}}", label: "Domain" },
  { tag: "{{topic}}", label: "Topic" },
  { tag: "{{their_article}}", label: "Their Article Title" },
  { tag: "{{our_site}}", label: "Your Site Name" },
  { tag: "{{our_url}}", label: "Your URL" },
  { tag: "{{sender_name}}", label: "Your Name" },
]

export function TemplateEditor({
  template,
  onSave,
}: {
  template?: { name?: string; subject?: string; body_html?: string; body_text?: string } | null
  onSave: (data: { name: string; subject: string; bodyHtml: string; bodyText: string }) => Promise<void>
}) {
  const [name, setName] = useState(template?.name || "")
  const [subject, setSubject] = useState(template?.subject || "")
  const [bodyHtml, setBodyHtml] = useState(template?.body_html || "")
  const [bodyText, setBodyText] = useState(template?.body_text || "")
  const [saving, setSaving] = useState(false)

  const insertTag = (tag: string) => {
    setBodyHtml((prev) => prev + tag)
    setBodyText((prev) => prev + tag)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ name, subject, bodyHtml, bodyText })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <input
        placeholder="Template name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary placeholder:text-[#999999]"
      />
      <input
        placeholder="Subject line (use {{tags}})"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary placeholder:text-[#999999]"
      />

      <div className="flex flex-wrap gap-2">
        {MERGE_TAGS.map((t) => (
          <button
            key={t.tag}
            onClick={() => insertTag(t.tag)}
            className="rounded bg-brand-surface px-2 py-1 text-xs font-mono text-brand-secondary hover:bg-[#DCDDDE]"
          >
            {t.tag}
          </button>
        ))}
      </div>

      <div>
        <label className="text-sm font-medium text-[#575858]">HTML Body</label>
        <textarea
          className="mt-1 min-h-[300px] w-full rounded-lg border border-[#CCCCCD] bg-brand-white p-3 font-mono text-sm text-brand-secondary"
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-[#575858]">Plain Text Body</label>
        <textarea
          className="mt-1 min-h-[150px] w-full rounded-lg border border-[#CCCCCD] bg-brand-white p-3 font-mono text-sm text-brand-secondary"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name || !subject || !bodyHtml}
        className="rounded-lg bg-brand-secondary px-6 py-2 text-sm font-medium text-brand-white transition-colors hover:bg-[#1f0066] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Template"}
      </button>
    </div>
  )
}
