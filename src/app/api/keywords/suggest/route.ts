import { fetchGoogleSuggest } from "@/lib/keyword-service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")
  if (!q) return NextResponse.json({ error: "Query required" }, { status: 400 })

  try {
    const suggestions = await fetchGoogleSuggest(q)
    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error("Suggest error:", error)
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 })
  }
}
