import { createClient } from '@supabase/supabase-js'
import type { Enums, Tables } from './database.types'
import type { Database } from './database-normalized.types'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mtfeuozwxwayzcjltaak.supabase.co'
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0ncosNLuIzGjrMCFjXB8kQ_FalVfKJ8'

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export type AppRole = Enums<'app_role'>
export type UserProfile = Tables<'user_profiles'>
