"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

const POLL_MS = 60000

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/notifications")
        const data = await res.json()
        if (cancelled) return
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      } catch {
        // ignore transient failures
      }
    }
    load()
    const interval = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const markOneRead = async (id: string) => {
    setNotifications((cur) => cur.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" })
    } catch {
      // optimistic update stays
    }
  }

  const markAllRead = async () => {
    setNotifications((cur) => cur.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      })
    } catch {
      // optimistic
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications, ${unreadCount} unread`}
        className="relative rounded-lg border border-[#CCCCCD] bg-brand-white p-2 text-[#575858] hover:bg-brand-surface"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-lg border border-[#DCDDDE] bg-brand-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[#DCDDDE] px-4 py-2">
              <span className="text-sm font-medium text-brand-secondary">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-brand-accent hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[#777777]">
                  No notifications yet.
                </p>
              ) : (
                <ul>
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={`border-b border-[#DCDDDE] last:border-0 ${n.read ? "" : "bg-brand-primary/50"}`}
                    >
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => {
                            if (!n.read) markOneRead(n.id)
                            setOpen(false)
                          }}
                          className="block px-4 py-3 hover:bg-brand-surface"
                        >
                          <p className="text-sm font-medium text-brand-secondary">
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 truncate text-xs text-[#575858]">{n.body}</p>
                          )}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">
                          <p className="text-sm font-medium text-brand-secondary">{n.title}</p>
                          {n.body && (
                            <p className="mt-0.5 truncate text-xs text-[#575858]">{n.body}</p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
