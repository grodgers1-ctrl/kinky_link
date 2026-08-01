import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Adapter, AdapterUser } from "@auth/core/adapters"

// Lazy client: createClient only runs when a method is actually called at
// runtime. This keeps module-scope construction (NextAuth adapter wiring)
// safe during builds where env vars are absent (e.g. Glama Docker checks).
function lazyClient(getter: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_, prop) {
      return (getter() as any)[prop]
    },
  })
}

export function SupabaseAdapter(options: { url: string; secret: string }): Adapter {
  const supabase = lazyClient(() =>
    createClient(options.url, options.secret, {
      auth: { persistSession: false },
      global: { headers: { "X-Client-Info": "@auth/supabase-adapter" } },
    }),
  )

  function wrap<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return async (...args: A) => {
      try {
        const result = await fn(...args)
        console.log(`[adapter] ${name} success`, JSON.stringify({ args }))
        return result
      } catch (err) {
        console.error(`[adapter] ${name} error`, JSON.stringify({ args, error: (err as any).message, details: (err as any).details, code: (err as any).code }))
        throw err
      }
    }
  }

  return {
    createUser: wrap("createUser", async (user) => {
      const { data, error } = await supabase
        .from("users")
        .insert({
          id: (user as any).id,
          name: (user as any).name,
          email: (user as any).email,
          email_verified: (user as any).emailVerified?.toISOString?.() ?? null,
          image: (user as any).image,
        })
        .select()
        .single()
      if (error) throw error
      return data as AdapterUser
    }),

    getUser: wrap("getUser", async (id) => {
      const { data, error } = await supabase.from("users").select().eq("id", id).maybeSingle()
      if (error) throw error
      return (data as AdapterUser) ?? null
    }),

    getUserByEmail: wrap("getUserByEmail", async (email) => {
      const { data, error } = await supabase.from("users").select().eq("email", email).maybeSingle()
      if (error) throw error
      return (data as AdapterUser) ?? null
    }),

    getUserByAccount: wrap("getUserByAccount", async ({ providerAccountId, provider }) => {
      const { data, error } = await supabase
        .from("accounts")
        .select("users (*)")
        .eq("provider", provider)
        .eq("provider_account_id", providerAccountId)
        .maybeSingle()
      if (error) throw error
      if (!data || !data.users) return null
      const userData = Array.isArray(data.users) ? data.users[0] : data.users
      return userData ? (userData as unknown as AdapterUser) : null
    }),

    updateUser: wrap("updateUser", async (user) => {
      const { data, error } = await supabase
        .from("users")
        .update({
          name: (user as any).name,
          email: (user as any).email,
          email_verified: (user as any).emailVerified?.toISOString?.() ?? null,
          image: (user as any).image,
        })
        .eq("id", user.id!)
        .select()
        .single()
      if (error) throw error
      return data as AdapterUser
    }),

    deleteUser: wrap("deleteUser", async (userId) => {
      const { error } = await supabase.from("users").delete().eq("id", userId)
      if (error) throw error
    }),

    linkAccount: wrap("linkAccount", async (account) => {
      const { error } = await supabase.from("accounts").insert({
        user_id: (account as any).userId,
        type: (account as any).type,
        provider: (account as any).provider,
        provider_account_id: (account as any).providerAccountId,
        refresh_token: (account as any).refresh_token,
        access_token: (account as any).access_token,
        expires_at: (account as any).expires_at,
        token_type: (account as any).token_type,
        scope: (account as any).scope,
        id_token: (account as any).id_token,
        session_state: (account as any).session_state,
      })
      if (error) throw error
    }),

    unlinkAccount: wrap("unlinkAccount", async ({ providerAccountId, provider }) => {
      const { error } = await supabase
        .from("accounts")
        .delete()
        .match({ provider, provider_account_id: providerAccountId })
      if (error) throw error
    }),

    createSession: wrap("createSession", async ({ sessionToken, userId, expires }) => {
      const { data, error } = await supabase
        .from("sessions")
        .insert({ session_token: sessionToken, user_id: userId, expires: expires.toISOString() })
        .select()
        .single()
      if (error) throw error
      return data
    }),

    getSessionAndUser: wrap("getSessionAndUser", async (sessionToken) => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, users(*)")
        .eq("session_token", sessionToken)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const userData = Array.isArray(data.users) ? data.users[0] : data.users
      const { users: _, ...session } = data
      return { user: userData as unknown as AdapterUser, session }
    }),

    updateSession: wrap("updateSession", async (session) => {
      const { data, error } = await supabase
        .from("sessions")
        .update({ expires: session.expires?.toISOString() })
        .eq("session_token", session.sessionToken)
        .select()
        .single()
      if (error) throw error
      return data
    }),

    deleteSession: wrap("deleteSession", async (sessionToken) => {
      const { error } = await supabase.from("sessions").delete().eq("session_token", sessionToken)
      if (error) throw error
    }),

    createVerificationToken: wrap("createVerificationToken", async (token) => {
      const { data, error } = await supabase
        .from("verification_tokens")
        .insert({ ...token, expires: token.expires.toISOString() })
        .select()
        .single()
      if (error) throw error
      const { id, ...verificationToken } = data
      return verificationToken
    }),

    useVerificationToken: wrap("useVerificationToken", async ({ identifier, token }) => {
      const { data, error } = await supabase
        .from("verification_tokens")
        .delete()
        .match({ identifier, token })
        .select()
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { id, ...verificationToken } = data
      return verificationToken
    }),
  }
}
