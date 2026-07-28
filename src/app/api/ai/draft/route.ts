import { auth } from "@/lib/auth"
import { generateEmailDraft, checkAiUsage, getAiUsageRemaining } from "@/lib/ai-writer"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!checkAiUsage(session.user.id)) {
    return NextResponse.json({
      error: "Daily AI writing limit reached",
      remaining: 0,
    }, { status: 429 })
  }

  try {
    const body = await req.json()
    const { topic, articleTitle, siteName, prospectName, tone, campaignType } = body

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 })
    }

    const draft = await generateEmailDraft({
      topic,
      articleTitle: articleTitle || undefined,
      siteName: siteName || undefined,
      prospectName: prospectName || undefined,
      tone: tone || "friendly",
      campaignType: campaignType || "outreach",
    })

    return NextResponse.json({
      draft,
      remaining: getAiUsageRemaining(session.user.id),
    })
  } catch (error: any) {
    console.error("AI draft error:", error)
    return NextResponse.json({ error: error.message || "Failed to generate draft" }, { status: 500 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    remaining: getAiUsageRemaining(session.user.id),
  })
}
