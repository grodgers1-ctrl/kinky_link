export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DCDDDE] bg-brand-white p-4">
      <p className="text-sm text-[#777777]">{label}</p>
      <p className="mt-1 text-h2 font-semibold text-brand-secondary">{value}</p>
    </div>
  )
}
