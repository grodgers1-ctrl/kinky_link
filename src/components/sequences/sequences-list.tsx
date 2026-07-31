"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { SequenceEditorDialog } from "./sequence-editor-dialog"

interface SequenceStep {
  id: string
  step_order: number
  delay_days: number
  subject: string
}

interface Sequence {
  id: string
  name: string
  campaign_id: string | null
  created_at: string
  sequence_steps: SequenceStep[]
  enrolledCount: number
}

export function SequencesList({
  sequences,
  campaigns,
}: {
  sequences: Sequence[]
  campaigns: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [editorOpen, setEditorOpen] = useState(false)

  const campaignName = (id: string | null) =>
    campaigns.find((c) => c.id === id)?.name || (id ? "Unknown" : "—")

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditorOpen(true)}
          className="rounded-lg bg-brand-secondary px-4 py-2 text-sm font-medium text-brand-white hover:bg-[#1f0066]"
        >
          + New sequence
        </button>
      </div>

      {sequences.length === 0 ? (
        <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center">
          <p className="text-body text-[#575858]">No sequences yet.</p>
          <p className="mt-1 text-sm text-[#999999]">
            Create your first multi-step outreach sequence to auto-follow-up on non-responders.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#DCDDDE] bg-brand-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#DCDDDE] text-[#777777]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Steps</th>
                <th className="px-4 py-3 font-medium">Enrolled</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[#DCDDDE] text-brand-secondary last:border-0 hover:bg-brand-surface"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-[#575858]">{campaignName(s.campaign_id)}</td>
                  <td className="px-4 py-3 text-[#575858]">
                    {(s.sequence_steps || []).length}
                  </td>
                  <td className="px-4 py-3 text-[#575858]">{s.enrolledCount}</td>
                  <td className="px-4 py-3 text-[#575858]">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editorOpen && (
        <SequenceEditorDialog
          campaigns={campaigns}
          onClose={() => setEditorOpen(false)}
          onCreated={() => {
            setEditorOpen(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
