"use client"
import { useEffect, useState } from "react"

export function SavedKeywords() {
  const [keywords, setKeywords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSaved = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/keywords")
      const d = await res.json()
      setKeywords(d.keywords || [])
    } catch {
      setKeywords([])
    }
    setLoading(false)
  }

  useEffect(() => { fetchSaved() }, [])

  const remove = async (id: string) => {
    await fetch(`/api/keywords?id=${id}`, { method: "DELETE" })
    fetchSaved()
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
        ))}
      </div>
    )
  }

  if (keywords.length === 0) {
    return (
      <p className="text-sm text-[#575858]">
        No saved keywords. Use the keyword research tool to find and save keywords.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#DCDDDE]">
      <table className="min-w-full divide-y divide-[#DCDDDE]">
        <thead className="bg-brand-surface">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Keyword</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Source</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-[#777777]">Saved</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase text-[#777777]">Remove</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#DCDDDE] bg-white">
          {keywords.map((kw: any) => (
            <tr key={kw.id} className="hover:bg-brand-surface">
              <td className="px-4 py-3 text-sm font-medium text-brand-secondary">{kw.keyword}</td>
              <td className="px-4 py-3 text-sm text-[#575858]">{kw.source}</td>
              <td className="px-4 py-3 text-right text-sm text-[#999999]">
                {new Date(kw.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => remove(kw.id)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
