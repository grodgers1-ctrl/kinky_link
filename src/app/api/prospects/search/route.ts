import { auth } from "@/lib/auth"
import { getProspectsForKeyword } from "@/lib/corpus"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get("keyword")
    if (!keyword) {
      return NextResponse.json({ error: "Keyword required" }, { status: 400 })
    }
    if (keyword.length > 200) {
      return NextResponse.json({ error: "Keyword too long" }, { status: 400 })
    }

    const results = await getProspectsForKeyword(keyword)
    return NextResponse.json({ results: results.slice(0, 10) })
  } catch (error) {
    console.error("SERP search error:", error)
    return NextResponse.json({ error: "Failed to search prospects" }, { status: 500 })
  }
}
