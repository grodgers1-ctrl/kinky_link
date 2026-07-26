"use client"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

export function ProspectCard({ prospect }: { prospect: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: prospect.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-lg border border-[#DCDDDE] bg-brand-white p-3 shadow-sm"
    >
      <p className="text-sm font-medium text-brand-secondary">{prospect.domain}</p>
      <p className="mt-1 truncate text-xs text-[#575858]">{prospect.title || "—"}</p>
      {prospect.domain_authority != null && (
        <span className="mt-2 inline-block rounded-full bg-brand-primary px-2 py-0.5 text-xs text-brand-secondary">
          DA {prospect.domain_authority}
        </span>
      )}
      {(prospect.tags?.length || 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {prospect.tags.slice(0, 2).map((t: string, i: number) => (
            <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{t}</span>
          ))}
          {prospect.tags.length > 2 && (
            <span className="text-[10px] text-[#999999]">+{prospect.tags.length - 2}</span>
          )}
        </div>
      )}
    </div>
  )
}
