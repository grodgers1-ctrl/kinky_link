"use client"
import { useState, useEffect } from "react"
import { DndContext, DragEndEvent } from "@dnd-kit/core"
import { PipelineColumn } from "./pipeline-column"

const COLUMNS = [
  { id: "prospect", label: "Prospects", color: "bg-gray-50" },
  { id: "contacted", label: "Contacted", color: "bg-blue-50" },
  { id: "replied", label: "Replied", color: "bg-yellow-50" },
  { id: "live_link", label: "Live Link", color: "bg-green-50" },
]

export function PipelineBoard() {
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProspects = async () => {
    const res = await fetch("/api/prospects")
    const data = await res.json()
    setProspects(data.prospects || [])
    setLoading(false)
  }

  useEffect(() => { fetchProspects() }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const newStatus = over.id as string
    setProspects((prev) =>
      prev.map((p) => (p.id === active.id ? { ...p, status: newStatus } : p))
    )

    await fetch("/api/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, status: newStatus }),
    })
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
            color={col.color}
            prospects={prospects.filter((p) => p.status === col.id)}
          />
        ))}
      </div>
    </DndContext>
  )
}
