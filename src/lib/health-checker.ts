import pLimit from "p-limit"
import { supabaseAdmin } from "@/lib/db"

const limit = pLimit(10)

export async function checkSingleUrl(url: string) {
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

export function determineHealth(result: { statusCode: number | null; redirected: boolean; reachable: boolean; error: string | null }): string {
  if (result.error === "timeout" || !result.reachable) return "unreachable"
  if (result.statusCode === 404 || result.statusCode === 410) return "broken"
  if (result.statusCode === 403 || result.statusCode === 401) return "healthy"
  if (result.redirected) return "redirected"
  if (result.statusCode && result.statusCode >= 200 && result.statusCode < 300) return "healthy"
  if (result.statusCode && result.statusCode >= 500) return "error"
  return "pending"
}

export async function checkBacklinkHealth(backlinkId: string) {
  const { data: bl } = await supabaseAdmin
    .from("backlinks")
    .select("*")
    .eq("id", backlinkId)
    .single()

  if (!bl) throw new Error("Backlink not found")

  const result = await checkSingleUrl(bl.source_url)
  const healthStatus = determineHealth(result)

  await supabaseAdmin
    .from("backlinks")
    .update({ health_status: healthStatus, last_health_check: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", backlinkId)

  await supabaseAdmin.from("backlink_history").insert({
    backlink_id: backlinkId,
    health_status: healthStatus,
  })

  return { id: backlinkId, ...result, healthStatus }
}

export async function batchCheckAllBacklinks(userId?: string) {
  let query = supabaseAdmin
    .from("backlinks")
    .select("id, source_url, user_id")

  if (userId) query = query.eq("user_id", userId)

  const { data: backlinks } = await query
  if (!backlinks || backlinks.length === 0) return { checked: 0, broken: 0, healthy: 0 }

  let brokenCount = 0
  let healthyCount = 0

  const checkOne = async (bl: any) => {
    const result = await checkSingleUrl(bl.source_url)
    const healthStatus = determineHealth(result)

    await supabaseAdmin
      .from("backlinks")
      .update({ health_status: healthStatus, last_health_check: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", bl.id)

    await supabaseAdmin.from("backlink_history").insert({
      backlink_id: bl.id,
      health_status: healthStatus,
    })

    if (healthStatus === "broken") {
      brokenCount++
      await supabaseAdmin.from("notifications").insert({
        user_id: bl.user_id,
        type: "info",
        title: "Broken backlink detected",
        body: `${bl.source_url} is broken`,
        link: `/dashboard/backlinks/${bl.id}`,
      }).maybeSingle()
    } else if (healthStatus === "healthy") {
      healthyCount++
    }
  }

  await Promise.all(backlinks.map(bl => limit(checkOne, bl)))

  return { checked: backlinks.length, broken: brokenCount, healthy: healthyCount }
}
