import { auth } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get("campaignId")
  const status = searchParams.get("status")
  const search = searchParams.get("search")

  let query = supabase
    .from("prospects")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  if (campaignId) query = query.eq("campaign_id", campaignId)
  if (status) query = query.eq("status", status)
  if (search) query = query.ilike("title", `%${search}%`)

  const { data } = await query
  return NextResponse.json({ prospects: data || [] })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body

  const { data, error } = await supabase
    .from("prospects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prospect: data })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  await supabase.from("prospects").delete().eq("id", id).eq("user_id", session.user.id)
  return NextResponse.json({ success: true })
}
