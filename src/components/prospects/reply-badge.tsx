"use client"
import { useState, useEffect } from "react"

export function ReplyBadge({ prospectId }: { prospectId: string }) {
  const [reply, setReply] = useState<{ created_at: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/email/replies?prospectId=${prospectId}`)
      .then((r) => r.json())
      .then((d) => setReply(d.reply))
      .catch(() => setReply(null))
      .finally(() => setLoading(false))
  }, [prospectId])

  if (loading) return null
  if (!reply) return null

  return (
    <div className="mt-2 rounded-lg border border-brand-primary bg-brand-primary p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-brand-secondary">Reply received</span>
        <span className="text-xs text-[#575858]">
          {new Date(reply.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-1 text-sm text-brand-secondary">Sequence auto-paused</p>
    </div>
  )
}
