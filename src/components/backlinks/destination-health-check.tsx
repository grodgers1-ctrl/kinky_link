"use client"
import { useState } from "react"

export function DestinationHealthCheck({ targetUrl }: { targetUrl: string }) {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const check = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/check-url?url=${encodeURIComponent(targetUrl)}`)
      const data = await res.json()
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  const isOk = result?.statusCode && result.statusCode >= 200 && result.statusCode < 300

  return (
    <div>
      <div className="mt-2 flex items-center gap-2">
        {result && (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            isOk ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}>
            {result.statusCode || "ERR"} {isOk ? "OK" : "ISSUE"}
          </span>
        )}
        {result && (
          <span className="text-xs text-[#999999]">{result.statusText || result.error || ""}</span>
        )}
        <button
          onClick={check}
          disabled={loading}
          className="text-sm text-blue-600 hover:underline disabled:opacity-50"
        >
          {loading ? "Checking..." : "Check Now"}
        </button>
      </div>
      <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm text-blue-600 hover:underline">
        {targetUrl}
      </a>
    </div>
  )
}
