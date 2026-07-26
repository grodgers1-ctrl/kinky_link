"use client"
import { useState, useEffect } from "react"
import { DndContext, DragEndEvent } from "@dnd-kit/core"
import { PipelineColumn } from "./pipeline-column"
import { useToast } from "@/components/ui/toast"
import type { Prospect } from "@/types"

const COLUMNS = [
  { id: "prospect", label: "Prospects" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "live_link", label: "Live Link" },
]

export function PipelineBoard() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const { addToast } = useToast()

  const fetchProspects = async () => {
    setError("")
    try {
      const res = await fetch("/api/prospects")
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to load")
        setProspects([])
      } else {
        setProspects(data.prospects || [])
      }
    } catch {
      setError("Failed to load pipeline")
      setProspects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProspects() }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const newStatus = over.id as Prospect["status"]
    const prevProspects = [...prospects]

    setProspects((prev) =>
      prev.map((p) => (p.id === active.id ? { ...p, status: newStatus } : p))
    )

    try {
      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: active.id, status: newStatus }),
      })
      if (res.ok) {
        addToast(`Moved to ${newStatus}`)
      } else {
        setProspects(prevProspects)
        addToast("Failed to move prospect", "error")
      }
    } catch {
      setProspects(prevProspects)
      addToast("Failed to move prospect", "error")
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-brand-accent bg-[#FFF0F2] p-4 text-sm text-brand-accent">
        {error}
        <button onClick={fetchProspects} className="ml-3 underline">Retry</button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.id} className="rounded-xl border border-[#DCDDDE] bg-brand-white p-4">
            <div className="h-6 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <PipelineColumn
            key={col.id}
            id={col.id}
            label={col.label}
            prospects={prospects.filter((p) => p.status === col.id)}
          />
        ))}
      </div>
    </DndContext>
  )
}
