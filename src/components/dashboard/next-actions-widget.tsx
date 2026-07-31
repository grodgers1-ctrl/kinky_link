import { supabaseAdmin } from "@/lib/db"
import Link from "next/link"

interface Site {
  id: string
}

async function countQuickWinKeywords(userId: string, siteIds: string[]): Promise<number> {
  if (siteIds.length === 0) return 0
  const { data } = await supabaseAdmin
    .from("keywords")
    .select("impressions, avg_position")
    .eq("user_id", userId)
    .in("site_id", siteIds)
    .eq("source", "gsc")
    .gte("avg_position", 11)
    .lte("avg_position", 30)
    .gt("impressions", 0)
  return data?.length || 0
}

async function countUnrespondedReplies(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "replied")
  return count || 0
}

async function countBacklinksLostThisWeek(userId: string): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count } = await supabaseAdmin
    .from("backlinks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("health_status", ["broken", "unreachable", "redirected"])
    .gt("last_health_check", sevenDaysAgo)
  return count || 0
}

export async function NextActionsWidget({
  userId,
  sites,
}: {
  userId: string
  sites: Site[]
}) {
  const siteIds = sites.map((s) => s.id)

  const [quickWins, unresponded, lost] = await Promise.all([
    countQuickWinKeywords(userId, siteIds),
    countUnrespondedReplies(userId),
    countBacklinksLostThisWeek(userId),
  ])

  const cards = [
    {
      key: "quick-wins",
      label: "Quick-win keywords",
      count: quickWins,
      hint: "Keywords on GSC pages 2-3 with impressions",
      href: "/dashboard/keywords",
      cta: "Review",
      empty: "No quick wins right now",
    },
    {
      key: "replies",
      label: "Prospects who replied",
      count: unresponded,
      hint: "Reply back before they cool off",
      href: "/dashboard/prospects?status=replied",
      cta: "Respond",
      empty: "No pending replies",
    },
    {
      key: "lost",
      label: "Backlinks lost this week",
      count: lost,
      hint: "Broken, unreachable, or redirected — check what happened",
      href: "/dashboard/backlinks?filter=lost",
      cta: "Investigate",
      empty: "No losses this week",
    },
  ]

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-h3 font-semibold text-brand-secondary">Next actions</h2>
        <p className="text-xs text-[#777777]">Your three highest-leverage jobs right now</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className="rounded-xl border border-[#DCDDDE] bg-brand-white p-4 transition-colors hover:border-brand-accent"
          >
            <p className="text-xs uppercase tracking-wider text-[#777777]">{c.label}</p>
            <p className="mt-2 text-3xl font-bold text-brand-secondary">{c.count}</p>
            <p className="mt-1 text-xs text-[#575858]">
              {c.count > 0 ? c.hint : c.empty}
            </p>
            {c.count > 0 && (
              <p className="mt-3 text-xs font-medium text-brand-accent">{c.cta} &rarr;</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
