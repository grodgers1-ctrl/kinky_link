import { HealthBadge } from "./health-badge"

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", "") } catch { return url }
}

export function BacklinksTable({ backlinks, onRefresh }: { backlinks: any[]; onRefresh: () => void }) {
  if (backlinks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#DCDDDE] p-12 text-center">
        <p className="text-[#575858]">No backlinks found yet.</p>
        <p className="mt-1 text-sm text-[#999999]">
          Backlinks will appear after the daily sync with Google Search Console.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#DCDDDE]">
      <table className="min-w-full divide-y divide-[#DCDDDE]">
        <thead className="bg-brand-surface">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Source URL</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Anchor Text</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Site</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">First Seen</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Last Seen</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#777777]">Indexed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#DCDDDE] bg-white">
          {backlinks.map(bl => (
            <tr key={bl.id} className="hover:bg-brand-surface">
              <td className="px-4 py-3">
                <HealthBadge status={bl.health_status} />
              </td>
              <td className="max-w-[300px] truncate px-4 py-3">
                <a
                  href={bl.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {bl.source_url}
                </a>
              </td>
              <td className="max-w-[150px] truncate px-4 py-3 text-sm text-[#575858]">
                {bl.anchor_text || "\u2014"}
              </td>
              <td className="px-4 py-3 text-sm text-[#575858]">
                {bl.sites?.url ? extractDomain(bl.sites.url) : "\u2014"}
              </td>
              <td className="px-4 py-3 text-sm text-[#999999]">{bl.first_seen}</td>
              <td className="px-4 py-3 text-sm text-[#999999]">{bl.last_seen}</td>
              <td className="px-4 py-3">
                {bl.is_indexed === true ? (
                  <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Yes</span>
                ) : bl.is_indexed === false ? (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">No</span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-[#575858]">?</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
