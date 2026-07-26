"use client"
import { useDroppable } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ProspectCard } from "./prospect-card"

export function PipelineColumn({
  id,
  label,
  color,
  prospects,
}: {
  id: string
  label: string
  color: string
  prospects: any[]
}) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <div className="flex flex-col rounded-xl border border-[#DCDDDE] bg-brand-white">
      <div className={`flex items-center justify-between rounded-t-xl px-4 py-3 ${color}`}>
        <h3 className="text-sm font-medium text-brand-secondary">{label}</h3>
        <span className="rounded-full bg-brand-white px-2 py-0.5 text-xs font-medium text-[#575858]">
          {prospects.length}
        </span>
      </div>
      <div ref={setNodeRef} className="flex min-h-[300px] flex-col gap-2 p-3">
        <SortableContext items={prospects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {prospects.map((prospect) => (
            <ProspectCard key={prospect.id} prospect={prospect} />
          ))}
        </SortableContext>
        {prospects.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-[#DCDDDE] p-4">
            <span className="text-xs text-[#999999]">Drop here</span>
          </div>
        )}
      </div>
    </div>
  )
}
