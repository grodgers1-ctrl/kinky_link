"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: "Megaphone" },
  { href: "/dashboard/prospects", label: "Prospects", icon: "Users" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: "Kanban" },
  { href: "/dashboard/templates", label: "Templates", icon: "FileText" },
  { href: "/dashboard/sequences", label: "Sequences", icon: "GitBranch" },
  { href: "/dashboard/backlinks", label: "Backlinks", icon: "Link" },
  { href: "/dashboard/keywords", label: "Keywords", icon: "Search" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const nav = (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
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
  )

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-[#DCDDDE] bg-brand-white p-2 md:hidden"
      >
        <svg className="h-5 w-5 text-brand-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cn(
          "flex h-screen flex-col border-r border-[#DCDDDE] bg-brand-white transition-transform",
          "fixed inset-y-0 left-0 z-50 w-64 md:relative",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center gap-2 border-b border-[#DCDDDE] px-6 py-4">
          <img src="/brand/kinklink_logo.png" alt="kinkylink" className="h-7 w-auto" />
          <span className="text-h3 font-bold text-brand-secondary">kinkylink</span>
        </div>
        {nav}
      </aside>
    </>
  )
}
