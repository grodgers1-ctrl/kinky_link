"use client"
import { useState } from "react"
import type { SpamScoreResult } from "@/lib/spam-score"

const GRADE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: "bg-[#DDF7E5]", text: "text-[#166534]", label: "Excellent" },
  B: { bg: "bg-[#DDF7E5]", text: "text-[#166534]", label: "Good" },
  C: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", label: "Needs work" },
  D: { bg: "bg-[#FFE4E6]", text: "text-brand-accent", label: "Poor" },
  F: { bg: "bg-[#FFE4E6]", text: "text-brand-accent", label: "Will hit spam" },
}

export function SpamScoreBadge({ result }: { result: SpamScoreResult }) {
  const [open, setOpen] = useState(false)
  const style = GRADE_STYLES[result.grade]

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${style.bg} ${style.text}`}
        aria-expanded={open}
        aria-label={`Spam score: ${result.score} out of 10, grade ${result.grade}`}
      >
        <span className="font-semibold">{result.grade}</span>
        <span>
          {result.score.toFixed(1)}/10 &middot; {style.label}
        </span>
        {result.issues.length > 0 && (
          <span className="rounded-full bg-brand-white/60 px-1.5 py-0.5 text-[10px] font-normal">
            {result.issues.length} {result.issues.length === 1 ? "issue" : "issues"}
          </span>
        )}
      </button>

      {open && result.issues.length > 0 && (
        <ul className="mt-2 max-w-md space-y-1 rounded-lg border border-[#DCDDDE] bg-brand-white p-3 text-xs">
          {result.issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                  issue.severity === 3
                    ? "bg-brand-accent"
                    : issue.severity === 2
                      ? "bg-[#F59E0B]"
                      : "bg-[#9CA3AF]"
                }`}
              />
              <span className="text-[#575858]">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
