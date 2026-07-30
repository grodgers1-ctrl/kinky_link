import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/db"
import { toolSchemas } from "@/lib/mcp/tools"
import "@/lib/mcp/handlers"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: key } = await supabaseAdmin
    .from("api_keys")
    .select("id, key_prefix, last_used_at, created_at")
    .eq("user_id", session.user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!key) {
    return NextResponse.json(
      { ok: false, error: "No active API key found. Create one first." },
      { status: 400 },
    )
  }

  const tools = toolSchemas()

  return NextResponse.json({
    ok: true,
    keyPrefix: key.key_prefix,
    keyId: key.id,
    lastUsedAt: key.last_used_at,
    toolCount: tools.length,
    tools: tools.map((t) => ({ name: t.name, description: t.description })).slice(0, 3),
  })
}
