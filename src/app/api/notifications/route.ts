import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, type, title, body, link, read, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const unreadCount = (data || []).filter((n) => !n.read).length
  return NextResponse.json({ notifications: data || [], unreadCount })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const ids = Array.isArray(body?.ids) ? (body.ids as string[]) : []

    if (ids.length === 0) {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", session.user.id)
        .eq("read", false)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabaseAdmin
        .from("notifications")
        .update({ read: true })
        .eq("user_id", session.user.id)
        .in("id", ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Notifications PATCH error:", error)
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 })
  }
}
