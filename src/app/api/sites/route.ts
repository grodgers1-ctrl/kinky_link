import { auth } from "@/lib/auth"
import { getGscClient } from "@/lib/google"
import { supabaseAdmin } from "@/lib/db"
import { NextResponse } from "next/server"

interface GaxiosLike {
  code?: number | string
  status?: number
  response?: {
    status?: number
    data?: { error?: { message?: string; errors?: Array<{ reason?: string; message?: string }> } }
  }
  errors?: Array<{ message?: string; reason?: string }>
  message?: string
}

interface UnwrappedError {
  status: number
  message: string
  reason?: string
}

function unwrapGoogleError(e: unknown): UnwrappedError {
  const err = e as GaxiosLike
  const status =
    err.response?.status ?? err.status ?? (typeof err.code === "number" ? err.code : 500)
  const reason = err.response?.data?.error?.errors?.[0]?.reason ?? err.errors?.[0]?.reason
  const message =
    err.response?.data?.error?.message ??
    err.errors?.[0]?.message ??
    err.message ??
    "Unknown error"
  return { status, message, reason }
}

interface ConnectError {
  error: string
  detail?: string
  action?: { label: string; url: string }
  adminNote?: { label: string; url: string }
  status?: number
  reason?: string
}

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const raw = process.env.ADMIN_EMAILS || ""
  const admins = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  return admins.includes(email.toLowerCase())
}

function extractEnableUrl(message: string): string | null {
  const match = message.match(/https:\/\/console\.developers\.google\.com\/[^\s)]+/)
  return match ? match[0] : null
}

function classify(
  unwrapped: UnwrappedError,
  sessionEmail: string | null | undefined,
): ConnectError {
  const { status, message, reason } = unwrapped

  if (
    reason === "SERVICE_DISABLED" ||
    reason === "accessNotConfigured" ||
    /has not been used in project/i.test(message)
  ) {
    const enableUrl = extractEnableUrl(message)
    const err: ConnectError = {
      error: "Our Google integration needs setup",
      detail:
        "linklight can't reach Google Search Console because an API is disabled in our Google Cloud project. This is on us to fix — try again in a few minutes.",
      status,
      reason,
    }
    if (isAdmin(sessionEmail) && enableUrl) {
      err.adminNote = { label: "Admin: enable Search Console API", url: enableUrl }
    }
    return err
  }

  if (status === 403 && reason === "insufficientPermissions") {
    return {
      error: "No verified Search Console properties",
      detail:
        "The Google account you're signed in with isn't a verified owner of any site in Search Console. Add and verify a site, then come back and connect.",
      action: { label: "Open Search Console", url: "https://search.google.com/search-console" },
      status,
      reason,
    }
  }

  if (status === 401) {
    return {
      error: "Google authorization expired",
      detail: "Sign out and back in to reconnect your Google account.",
      action: { label: "Sign out", url: "/api/auth/signout" },
      status,
      reason,
    }
  }

  return {
    error: "Couldn't fetch sites",
    detail: message,
    status,
    reason,
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user || !session.accessToken) {
    return NextResponse.json(
      {
        error: "Not signed in",
        detail: "No access token in session — sign out and back in.",
        action: { label: "Sign in", url: "/api/auth/signin" },
      } satisfies ConnectError,
      { status: 401 },
    )
  }

  const sessionError = (session as unknown as { error?: string }).error
  if (sessionError === "RefreshAccessTokenError") {
    return NextResponse.json(
      {
        error: "Google authorization expired",
        detail: "Automatic token refresh failed. Sign out and back in to reconnect.",
        action: { label: "Sign out", url: "/api/auth/signout" },
      } satisfies ConnectError,
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
    const unwrapped = unwrapGoogleError(error)
    console.error("GSC API error:", { ...unwrapped, raw: error })
    const body = classify(unwrapped, session.user.email)
    const httpStatus =
      body.status === 401 ? 401 : body.status === 403 ? 403 : body.status === 429 ? 429 : 500
    return NextResponse.json(body, { status: httpStatus })
  }
}
