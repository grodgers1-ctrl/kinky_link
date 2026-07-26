"use client"
import { useState } from "react"
import { ProspectTable } from "./prospect-table"
import type { ProspectSearchResult } from "@/types"

export function ProspectSearch({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<ProspectSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const search = async () => {
    if (!keyword.trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/prospects/search?keyword=${encodeURIComponent(keyword)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Search failed")
        setResults([])
      } else {
        setResults(data.results || [])
      }
    } catch {
      setError("Failed to search. Try again.")
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          placeholder="Enter a keyword or topic (e.g. 'SEO tips', 'content marketing')"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          className="flex-1 rounded-lg border border-[#CCCCCD] bg-brand-white px-3 py-2 text-sm text-brand-secondary placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-brand-secondary"
        />
        <button
          onClick={search}
          disabled={loading}
          className="rounded-lg bg-brand-secondary px-6 py-2 text-sm font-medium text-brand-white transition-colors hover:bg-[#1f0066] disabled:opacity-50"
        >
          {loading ? "Searching..." : "Find Prospects"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-3 text-sm text-brand-accent">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <ProspectTable results={results} campaigns={campaigns} />
      )}

      {!loading && !error && results.length === 0 && keyword && (
        <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center text-sm text-[#575858]">
          No prospects found for this keyword. Try a different search.
        </div>
      )}
    </div>
  )
}
