export interface User {
  id: string
  email: string
  name?: string | null
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export interface Site {
  id: string
  user_id: string
  url: string
  gsc_verified: boolean
  created_at: string
}

export interface Campaign {
  id: string
  user_id: string
  site_id?: string | null
  name: string
  status: "active" | "paused" | "completed"
  created_at: string
  updated_at: string
}

export interface Prospect {
  id: string
  user_id: string
  campaign_id?: string | null
  url: string
  domain?: string | null
  title?: string | null
  description?: string | null
  domain_authority?: number | null
  email?: string | null
  email_verified: boolean
  name?: string | null
  notes?: string | null
  tags: string[]
  status: "prospect" | "contacted" | "replied" | "live_link" | "declined" | "archived"
  pipeline_order: number
  created_at: string
  updated_at: string
}
