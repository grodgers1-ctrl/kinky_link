"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "outreach", label: "Outreach" },
  { value: "guest_post", label: "Guest Post" },
  { value: "resource_page", label: "Resource Page" },
  { value: "skyscraper", label: "Skyscraper" },
  { value: "link_reclamation", label: "Link Reclamation" },
  { value: "custom", label: "Custom" },
]

export function TemplateLibrary({
  templates,
}: {
  templates: { id: string; name: string; category: string; subject: string; body_html: string; is_seed: boolean }[]
}) {
  const router = useRouter()
  const { addToast } = useToast()
  const [category, setCategory] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = category ? templates.filter((t) => t.category === category) : templates

  const remove = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/templates?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        addToast("Template deleted")
        router.refresh()
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              category === c.value
                ? "bg-brand-secondary text-brand-white"
                : "bg-brand-surface text-[#575858] hover:bg-[#DCDDDE]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center text-sm text-[#575858]">
          No templates found.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-[#DCDDDE] bg-brand-white p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-medium text-brand-secondary">{t.name}</h3>
                {t.is_seed && (
                  <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] text-brand-secondary">
                    Seed
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[#777777]">{t.category}</p>
              <p className="mt-2 truncate text-sm text-[#575858]">{t.subject}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[#999999]">
                {t.body_html.replace(/<[^>]+>/g, "").slice(0, 120)}...
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setSelectedId(t.id)}
                  className="rounded bg-brand-secondary px-3 py-1 text-xs font-medium text-brand-white"
                >
                  Use
                </button>
                <button
                  onClick={() => remove(t.id)}
                  disabled={deleting === t.id}
                  className="rounded border border-[#CCCCCD] px-3 py-1 text-xs text-[#575858] hover:bg-brand-surface disabled:opacity-50"
                >
                  {deleting === t.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <UseTemplateDialog
          templateId={selectedId}
          onClose={() => setSelectedId(null)}
          onSent={() => { setSelectedId(null); addToast("Email sent") }}
        />
      )}
    </div>
  )
}

function UseTemplateDialog({
  templateId,
  onClose,
  onSent,
}: {
  templateId: string
  onClose: () => void
  onSent: () => void
}) {
  const [template, setTemplate] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [campaignId, setCampaignId] = useState("")
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([])
  const [recipient, setRecipient] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)

  useState(() => {
    fetch(`/api/templates?category=`)
      .then((r) => r.json())
      .then((d) => {
        const t = (d.templates || []).find((t: any) => t.id === templateId)
        setTemplate(t)
        if (t) {
          setSubject(t.subject)
          setBody(t.body_html)
        }
      })
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(d.campaigns || []))
      .finally(() => setLoading(false))
  })

  const handleSend = async () => {
    if (!recipient || !subject) return
    setSending(true)
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipient, subject, bodyHtml: body, bodyText: "", campaignId: campaignId || undefined }),
      })
      if (res.ok) onSent()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-brand-white p-6 shadow-lg">
        <h2 className="text-h3 font-bold text-brand-secondary">
          {template?.name || "Send Email"}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-[#575858]">Campaign (optional)</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm"
            >
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[#575858]">To</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="email@example.com"
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#575858]">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#575858]">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 min-h-[200px] w-full rounded-lg border border-[#CCCCCD] bg-brand-white p-3 font-mono text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-[#CCCCCD] px-4 py-2 text-sm text-[#575858] hover:bg-brand-surface">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !recipient}
            className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}
