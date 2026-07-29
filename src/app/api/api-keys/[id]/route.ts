import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { revokeKey } from "@/lib/api-keys"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ok = await revokeKey(session.user.id, id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
