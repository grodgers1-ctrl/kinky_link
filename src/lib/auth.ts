import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { SupabaseAdapter } from "@/lib/supabase-adapter"

async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_at: number; refresh_token?: string } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) {
      console.error("Google token refresh failed:", res.status, await res.text())
      return null
    }
    const data = (await res.json()) as {
      access_token: string
      expires_in: number
      refresh_token?: string
    }
    return {
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      refresh_token: data.refresh_token,
    }
  } catch (error) {
    console.error("Google token refresh error:", error)
    return null
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: true,
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/webmasters.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token as string | undefined
        token.refreshToken = account.refresh_token as string | undefined
        token.expiresAt = account.expires_at as number | undefined
      }
      if (user) {
        token.id = user.id as string | undefined
      }

      const expiresAt = token.expiresAt as number | undefined
      const refreshToken = token.refreshToken as string | undefined
      const nowSec = Math.floor(Date.now() / 1000)
      if (expiresAt && refreshToken && nowSec > expiresAt - 60) {
        const refreshed = await refreshGoogleAccessToken(refreshToken)
        if (refreshed) {
          token.accessToken = refreshed.access_token
          token.expiresAt = refreshed.expires_at
          if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token
          delete (token as { error?: string }).error
        } else {
          ;(token as { error?: string }).error = "RefreshAccessTokenError"
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.accessToken = token.accessToken as string | undefined
        session.refreshToken = token.refreshToken as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: "/",
  },
})
