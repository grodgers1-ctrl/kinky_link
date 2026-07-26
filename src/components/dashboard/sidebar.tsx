"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: "Megaphone" },
  { href: "/dashboard/prospects", label: "Prospects", icon: "Users" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: "Kanban" },
  { href: "/dashboard/backlinks", label: "Backlinks", icon: "Link" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[#DCDDDE] bg-brand-white">
      <div className="flex items-center gap-2 border-b border-[#DCDDDE] px-6 py-4">
        <img src="/brand/kinklink_logo.png" alt="kinkylink" className="h-7 w-auto" />
        <span className="text-h3 font-bold text-brand-secondary">kinkylink</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-brand-primary text-brand-secondary"
                : "text-[#575858] hover:bg-brand-surface hover:text-brand-secondary"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
