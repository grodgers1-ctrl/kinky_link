import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { findEmail, parseName, extractDomain } from "@/lib/email-finder"
import { findEmailAcrossProviders } from "@/lib/email-cascade"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaignId } = body
    let { prospectIds } = body

    if (campaignId && !prospectIds) {
      const { data: campaignProspects } = await supabaseAdmin
        .from("prospects")
        .select("id")
        .eq("campaign_id", campaignId)
        .is("email", null)
        .eq("user_id", session.user.id)

      prospectIds = campaignProspects?.map(p => p.id) || []
    }

    if (!prospectIds || prospectIds.length === 0) {
      return NextResponse.json({ error: "No prospects specified" }, { status: 400 })
    }

    const { data: prospects } = await supabaseAdmin
      .from("prospects")
      .select("*")
      .in("id", prospectIds)
      .eq("user_id", session.user.id)

    if (!prospects) {
      return NextResponse.json({ error: "No prospects found" }, { status: 404 })
    }

    interface FindEmailResult {
      prospectId: string
      email: string | null
      confidence: string
      method: string
      pattern?: string
    }
    const results: FindEmailResult[] = []

    for (const prospect of prospects) {
      const domain = extractDomain(prospect.url)
      const { first, last } = parseName(prospect.name || prospect.title || domain)

      const patternResult = await findEmail(domain, first, last)

      if (patternResult.email) {
        await supabaseAdmin
          .from("prospects")
          .update({
            email: patternResult.email,
            email_verified: patternResult.confidence === "verified" || patternResult.confidence === "likely",
            updated_at: new Date().toISOString(),
          })
          .eq("id", prospect.id)

        results.push({
          prospectId: prospect.id,
          email: patternResult.email,
          confidence: patternResult.confidence,
          method: patternResult.method,
        })
      } else {
        const cascadeResult = await findEmailAcrossProviders(domain)
        if (cascadeResult.email) {
          await supabaseAdmin
            .from("prospects")
            .update({
              email: cascadeResult.email,
              email_verified: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", prospect.id)

          results.push({
            prospectId: prospect.id,
            email: cascadeResult.email,
            confidence: cascadeResult.confidence || "unknown",
            method: cascadeResult.source || "cascade",
          })
        } else {
          results.push({
            prospectId: prospect.id,
            email: null,
            confidence: "not_found",
            method: "none",
          })
        }
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Find email error:", error)
    return NextResponse.json({ error: "Failed to find emails" }, { status: 500 })
  }
}
