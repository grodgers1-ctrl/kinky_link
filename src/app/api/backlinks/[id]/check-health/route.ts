import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const { data: backlink } = await supabaseAdmin
      .from("backlinks")
      .select("*")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .single()

    if (!backlink) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const status = await checkSingleUrl(backlink.source_url)
    const targetStatus = await checkSingleUrl(backlink.target_url)

    let healthStatus = "healthy"
    if (status.statusCode === 404 || status.statusCode === 410) healthStatus = "broken"
    else if (status.redirected) healthStatus = "redirected"
    else if (status.error) healthStatus = "error"
    else if (!status.reachable) healthStatus = "unreachable"

    await supabaseAdmin
      .from("backlinks")
      .update({ health_status: healthStatus, last_health_check: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)

    await supabaseAdmin.from("backlink_history").insert({
      backlink_id: id,
      health_status: healthStatus,
    })

    if (healthStatus === "broken") {
      await supabaseAdmin.from("notifications").insert({
        user_id: session.user.id,
        type: "info",
        title: "Broken backlink detected",
        body: `${backlink.source_url} is returning ${status.statusCode}`,
        link: `/dashboard/backlinks/${id}`,
      }).maybeSingle()
    }

    return NextResponse.json({ healthStatus, sourceCheck: status, targetCheck: targetStatus })
  } catch (error) {
    console.error("Health check error:", error)
    return NextResponse.json({ error: "Health check failed" }, { status: 500 })
  }
}

async function checkSingleUrl(url: string) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkLight/1.0)" },
      redirect: "manual",
    })

    clearTimeout(timeout)

    return {
      url,
      statusCode: response.status,
      redirected: response.status >= 300 && response.status < 400,
      redirectUrl: response.headers.get("location") || null,
      reachable: true,
      error: null,
    }
  } catch (error: any) {
    return {
      url,
      statusCode: null,
      redirected: false,
      redirectUrl: null,
      reachable: false,
      error: error.name === "AbortError" ? "timeout" : error.message,
    }
  }
}
