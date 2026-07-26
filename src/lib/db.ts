import { createClient, type SupabaseClient } from "@supabase/supabase-js"

function getUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set")
  return url
}

let _anon: SupabaseClient | null = null
export function getSupabase() {
  if (!_anon) _anon = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
  return _anon
}

let _admin: SupabaseClient | null = null
export function getSupabaseAdmin() {
  if (!_admin) _admin = createClient(getUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY || "")
  return _admin
}

function lazyClient(getter: () => SupabaseClient): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_, prop) {
      return (getter() as any)[prop]
    },
  })
}

export const supabase = lazyClient(getSupabase)
export const supabaseAdmin = lazyClient(getSupabaseAdmin)
