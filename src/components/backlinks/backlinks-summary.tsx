export function BacklinksSummary({ summary }: { summary: { total: number; healthy: number; broken: number; pending: number } }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="rounded-lg border border-[#DCDDDE] bg-white p-4">
        <p className="text-sm text-[#777777]">Total Backlinks</p>
        <p className="mt-1 text-2xl font-semibold text-brand-secondary">{summary.total}</p>
      </div>
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-600">Healthy</p>
        <p className="mt-1 text-2xl font-semibold text-green-700">{summary.healthy}</p>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">Broken</p>
        <p className="mt-1 text-2xl font-semibold text-red-700">{summary.broken}</p>
      </div>
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-600">Pending Check</p>
        <p className="mt-1 text-2xl font-semibold text-yellow-700">{summary.pending}</p>
      </div>
    </div>
  )
}
