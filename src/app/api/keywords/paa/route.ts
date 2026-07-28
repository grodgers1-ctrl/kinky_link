import { auth } from "@/lib/auth"
import { fetchPeopleAlsoAsk } from "@/lib/keyword-service"
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
    const questions = await fetchPeopleAlsoAsk(q)
    return NextResponse.json({ questions })
  } catch (error) {
    console.error("PAA error:", error)
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 })
  }
}
