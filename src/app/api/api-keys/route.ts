import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { listKeys, createKey } from "@/lib/api-keys"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const keys = await listKeys(session.user.id)
  return NextResponse.json({ keys })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { name?: string } | null
  const name = body?.name?.trim() || "Untitled key"
  if (name.length > 60) return NextResponse.json({ error: "name too long" }, { status: 400 })
  const { raw, row } = await createKey(session.user.id, name)
  return NextResponse.json({ raw, row })
}
