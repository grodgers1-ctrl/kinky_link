const styles: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  redirected: "bg-yellow-100 text-yellow-800",
  broken: "bg-red-100 text-red-800",
  unreachable: "bg-orange-100 text-orange-800",
  pending: "bg-gray-100 text-[#575858]",
  error: "bg-red-100 text-red-800",
}

export function HealthBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100 text-[#575858]"}`}>
      {status}
    </span>
  )
}
