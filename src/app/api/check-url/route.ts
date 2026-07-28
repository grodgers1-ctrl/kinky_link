import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const url = searchParams.get("url")
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkLight/1.0)" },
    })

    clearTimeout(timeout)

    return NextResponse.json({
      url,
      statusCode: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })
  } catch (error: any) {
    return NextResponse.json({
      url,
      statusCode: null,
      error: error.name === "AbortError" ? "timeout" : error.message,
      ok: false,
    })
  }
}
