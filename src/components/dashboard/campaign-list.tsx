export function CampaignList({ campaigns }: { campaigns: any[] }) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-[#DCDDDE] bg-brand-white p-8 text-center">
        <p className="text-body text-[#575858]">No campaigns yet.</p>
        <p className="mt-1 text-sm text-[#999999]">Create your first campaign to get started.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#DCDDDE] bg-brand-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#DCDDDE] text-[#777777]">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Site</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id} className="border-b border-[#DCDDDE] text-brand-secondary last:border-0">
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-[#575858]">{c.sites?.url || "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded-full bg-brand-primary px-3 py-0.5 text-xs font-medium text-brand-secondary">
                  {c.status}
                </span>
              </td>
              <td className="px-4 py-3 text-[#575858]">
                {new Date(c.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
