import { auth } from "@/lib/auth"
import { estimateKeywordDifficulty } from "@/lib/keyword-service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")
  if (!q) return NextResponse.json({ error: "Query required" }, { status: 400 })

  try {
    const result = await estimateKeywordDifficulty(q)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Difficulty error:", error)
    return NextResponse.json({ error: "Failed to estimate difficulty" }, { status: 500 })
  }
}
