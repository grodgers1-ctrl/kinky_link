"use client"
import { useState, useEffect } from "react"

interface AiDraftButtonProps {
  onDraftGenerated: (draft: { subject: string; bodyHtml: string; bodyText: string }) => void
  templateType?: string
}

export function AiDraftButton({ onDraftGenerated, templateType }: AiDraftButtonProps) {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState("")
  const [articleTitle, setArticleTitle] = useState("")
  const [tone, setTone] = useState("friendly")
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState(5)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/ai/draft")
      .then(r => r.json())
      .then(d => { if (d.remaining !== undefined) setRemaining(d.remaining) })
      .catch(() => {})
  }, [])

  const generate = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          articleTitle: articleTitle || undefined,
          tone,
          campaignType: templateType || "outreach",
        }),
      })

      const data = await res.json()

      if (res.status === 429) {
        setError("Daily AI limit reached. Upgrade to generate more.")
        return
      }

      if (data.draft) {
        onDraftGenerated(data.draft)
        setOpen(false)
      }
      if (data.remaining !== undefined) setRemaining(data.remaining)
    } catch {
      setError("Failed to generate draft")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={remaining === 0}
        className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
      >
        AI Draft ({remaining} left)
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-medium text-brand-secondary">AI Email Draft</h3>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-[#777777]">Topic *</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g., SEO best practices for 2026"
                  className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm placeholder-[#999999]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#777777]">Their article title (optional)</label>
                <input
                  value={articleTitle}
                  onChange={e => setArticleTitle(e.target.value)}
                  placeholder="e.g., '10 SEO Tips That Actually Work'"
                  className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm placeholder-[#999999]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[#777777]">Tone</label>
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#CCCCCD] px-3 py-2 text-sm"
                >
                  <option value="friendly">Friendly & Warm</option>
                  <option value="professional">Professional & Polished</option>
                  <option value="direct">Direct & No-Nonsense</option>
                </select>
              </div>

              {error && <p className="text-sm text-brand-accent">{error}</p>}

              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="rounded-lg border border-[#DCDDDE] px-4 py-2 text-sm text-[#575858]">
                  Cancel
                </button>
                <button
                  onClick={generate}
                  disabled={loading || !topic.trim()}
                  className="rounded-lg bg-brand-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "Generating..." : "Generate Draft"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
