"use client"
import { useState } from "react"

export function KeywordIdeas() {
  const [seed, setSeed] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [paa, setPaa] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const research = async () => {
    if (!seed.trim()) return
    setLoading(true)

    try {
      const [suggestRes, paaRes, diffRes] = await Promise.all([
        fetch(`/api/keywords/suggest?q=${encodeURIComponent(seed)}`),
        fetch(`/api/keywords/paa?q=${encodeURIComponent(seed)}`),
        fetch(`/api/keywords/difficulty?q=${encodeURIComponent(seed)}`),
      ])

      setSuggestions((await suggestRes.json()).suggestions || [])
      setPaa((await paaRes.json()).questions || [])
      setDifficulty(await diffRes.json())
    } catch {
      // silently handle errors
    }

    setLoading(false)
  }

  const saveKeyword = async (keyword: string) => {
    try {
      await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, source: "suggest" }),
      })
    } catch {
      // silently handle
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          placeholder="Enter a seed keyword (e.g., 'link building')"
          value={seed}
          onChange={e => setSeed(e.target.value)}
          onKeyDown={e => e.key === "Enter" && research()}
          className="flex-1 rounded-lg border border-[#CCCCCD] px-4 py-2 text-sm placeholder-[#999999]"
        />
        <button
          onClick={research}
          disabled={loading}
          className="rounded-lg bg-brand-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Researching..." : "Research"}
        </button>
      </div>

      {suggestions.length === 0 && !loading && (
        <p className="text-sm text-[#575858]">Enter a seed keyword to discover related terms and questions.</p>
      )}

      {suggestions.length > 0 && (
        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-lg border border-[#DCDDDE] p-4">
            <h3 className="text-sm font-medium text-[#777777]">Google Suggest</h3>
            <div className="mt-2 space-y-1">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded px-2 py-1 hover:bg-brand-surface">
                  <span className="text-sm text-[#575858]">{s}</span>
                  <button onClick={() => saveKeyword(s)} className="text-xs text-blue-600 hover:underline">Save</button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#DCDDDE] p-4">
            <h3 className="text-sm font-medium text-[#777777]">People Also Ask</h3>
            <div className="mt-2 space-y-1">
              {paa.map((q, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded px-2 py-1 hover:bg-brand-surface">
                  <span className="text-sm text-[#575858]">{q}</span>
                  <button onClick={() => saveKeyword(q)} className="shrink-0 text-xs text-blue-600 hover:underline">Save</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {difficulty && (
        <div className="rounded-lg border border-[#DCDDDE] p-4">
          <h3 className="text-sm font-medium text-[#777777]">Keyword Difficulty Estimate</h3>
          <div className="mt-2 flex items-center gap-3">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              difficulty.difficulty === "high" ? "bg-red-100 text-red-800" :
              difficulty.difficulty === "medium" ? "bg-yellow-100 text-yellow-800" :
              "bg-green-100 text-green-800"
            }`}>
              {difficulty.difficulty}
            </span>
            <span className="text-sm text-[#575858]">
              {difficulty.totalResults?.toLocaleString()} exact match results
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
