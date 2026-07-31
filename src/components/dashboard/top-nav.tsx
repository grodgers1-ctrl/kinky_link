"use client"
import { signOut } from "next-auth/react"
import { NotificationsBell } from "./notifications-bell"

export function TopNav({ user }: { user: { name?: string | null; email?: string | null } }) {
  return (
    <header className="flex h-16 items-center justify-end border-b border-[#DCDDDE] bg-brand-white px-6">
      <div className="flex items-center gap-4">
        <NotificationsBell />
        <span className="text-sm text-[#575858]">{user?.email}</span>
        <button
          onClick={() => signOut()}
          className="rounded-lg border border-[#CCCCCD] bg-brand-white px-4 py-1.5 text-sm font-medium text-[#575858] hover:bg-brand-surface"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
