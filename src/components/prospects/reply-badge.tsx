"use client"
import { useState, useEffect } from "react"

export function ReplyBadge({ prospectId }: { prospectId: string }) {
  const [reply, setReply] = useState<{ created_at: string } | null>(null)

  useEffect(() => {
    fetch(`/api/email/replies?prospectId=${prospectId}`)
      .then((r) => r.json())
      .then((d) => setReply(d.reply))
      .catch(() => {})
  }, [prospectId])

  if (!reply) return null

  return (
    <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-green-700">Reply received</span>
        <span className="text-xs text-[#575858]">
          {new Date(reply.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-1 text-sm text-green-800">Sequence auto-paused</p>
    </div>
  )
}
