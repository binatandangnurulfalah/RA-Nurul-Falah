import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://mtfeuozwxwayzcjltaak.supabase.co'
export const supabasePublishableKey = 'sb_publishable_0ncosNLuIzGjrMCFjXB8kQ_FalVfKJ8'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type AppRole = 'admin' | 'teacher' | 'parent'

export type UserProfile = {
  id: string
  role: AppRole
  display_name: string | null
  phone: string | null
  address: string | null
  bio: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
