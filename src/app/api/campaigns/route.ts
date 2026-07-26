import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { name, siteId } = body

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      user_id: session.user.id,
      name,
      site_id: siteId || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("campaigns")
    .select("*, sites(url)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  return NextResponse.json({ campaigns: data || [] })
}
