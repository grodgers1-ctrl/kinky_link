import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")

    let query = supabaseAdmin
      .from("templates")
      .select("*")
      .or(`user_id.eq.${session.user.id},is_seed.eq.true`)
      .order("is_seed", { ascending: false })

    if (category) query = query.eq("category", category)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ templates: data || [] })
  } catch (error) {
    console.error("Templates list error:", error)
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { name, subject, bodyHtml, bodyText, category } = body

    if (!name || !subject || !bodyHtml) {
      return NextResponse.json({ error: "Name, subject, and bodyHtml are required" }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from("templates")
      .insert({
        user_id: session.user.id,
        name,
        subject,
        body_html: bodyHtml,
        body_text: bodyText || "",
        category: category || "custom",
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (error) {
    console.error("Template create error:", error)
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from("templates")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", session.user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Template not found" }, { status: 404 })
    return NextResponse.json({ template: data })
  } catch (error) {
    console.error("Template update error:", error)
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from("templates")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: "Template not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Template delete error:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}
