import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { SEED_TEMPLATES } from "@/lib/seed-templates"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { data: existing } = await supabaseAdmin
      .from("templates")
      .select("name")
      .eq("user_id", session.user.id)
      .eq("is_seed", true)

    const existingNames = new Set(existing?.map((t) => t.name) || [])
    const newTemplates = SEED_TEMPLATES.filter((t) => !existingNames.has(t.name))

    if (newTemplates.length === 0) {
      return NextResponse.json({ seeded: 0, message: "Seed templates already loaded" })
    }

    const rows = newTemplates.map((t) => ({
      user_id: session.user.id,
      name: t.name,
      subject: t.subject,
      body_html: t.body_html,
      body_text: t.body_text,
      category: t.category,
      is_seed: true,
    }))

    const { data, error } = await supabaseAdmin.from("templates").insert(rows).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ seeded: data?.length || 0 })
  } catch (error) {
    console.error("Seed error:", error)
    return NextResponse.json({ error: "Failed to seed templates" }, { status: 500 })
  }
}
