import { auth } from "@/lib/auth"
import { getGscClient } from "@/lib/google"
import { supabaseAdmin } from "@/lib/db"
import { NextResponse } from "next/server"

interface GaxiosLike {
  code?: number | string
  status?: number
  response?: { status?: number; data?: { error?: { message?: string } } }
  errors?: Array<{ message?: string; reason?: string }>
  message?: string
}

function unwrapGoogleError(e: unknown): { status: number; message: string; reason?: string } {
  const err = e as GaxiosLike
  const status = err.response?.status ?? err.status ?? (typeof err.code === "number" ? err.code : 500)
  const message =
    err.response?.data?.error?.message ??
    err.errors?.[0]?.message ??
    err.message ??
    "Unknown error"
  const reason = err.errors?.[0]?.reason
  return { status, message, reason }
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !session.accessToken) {
    return NextResponse.json(
      { error: "Not signed in", detail: "No access token in session — sign out and back in." },
      { status: 401 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionError = (session as unknown as { error?: string }).error
  if (sessionError === "RefreshAccessTokenError") {
    return NextResponse.json(
      {
        error: "Google session expired",
        detail: "Automatic token refresh failed — please sign out and back in.",
      },
      { status: 401 },
    )
  }

  try {
    const gsc = getGscClient(session.accessToken, session.refreshToken || "")
    const response = await gsc.sites.list()
    const sites = response.data.siteEntry || []

    const userId = session.user.id
    if (sites.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("sites")
        .select("url")
        .eq("user_id", userId)

      const existingUrls = new Set(existing?.map((s) => s.url) || [])

      for (const site of sites) {
        if (site.siteUrl && !existingUrls.has(site.siteUrl)) {
          await supabaseAdmin.from("sites").insert({
            user_id: userId,
            url: site.siteUrl,
            gsc_verified: true,
          })
        }
      }
    }

    return NextResponse.json({ sites })
  } catch (error) {
    const { status, message, reason } = unwrapGoogleError(error)
    console.error("GSC API error:", { status, message, reason, raw: error })

    if (status === 401) {
      return NextResponse.json(
        {
          error: "Google authorization expired or revoked",
          detail: "Sign out and back in to re-authorize.",
          status,
          message,
        },
        { status: 401 },
      )
    }
    if (status === 403) {
      return NextResponse.json(
        {
          error: "Search Console access denied",
          detail:
            reason === "insufficientPermissions"
              ? "The connected Google account isn't a verified owner of any site in Search Console. Verify a site first at search.google.com/search-console."
              : `Google refused: ${message}`,
          status,
          message,
          reason,
        },
        { status: 403 },
      )
    }
    return NextResponse.json(
      { error: "Failed to fetch sites", detail: message, status, reason },
      { status: 500 },
    )
  }
}
