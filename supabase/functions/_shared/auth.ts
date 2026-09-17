import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.116.0'
import { HttpError } from './response.ts'

export type AppRole = 'admin' | 'teacher' | 'parent'
export type RequesterProfile = { role: AppRole; is_active: boolean; display_name?: string | null }

export type AuthContext = {
  user: User
  userClient: SupabaseClient
  adminClient: SupabaseClient
  profile: RequesterProfile
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} belum dikonfigurasi.`)
  return value
}

export function createServiceRoleClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function requireAuthenticatedUser(req: Request): Promise<AuthContext> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Silakan login kembali.')

  const url = requiredEnv('SUPABASE_URL')
  const userClient = createClient(url, requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createServiceRoleClient()
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) throw new HttpError(401, 'Sesi tidak valid. Silakan login kembali.')

  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('role,is_active,display_name')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile) throw new HttpError(403, 'Profil pengguna tidak tersedia.')
  if (!profile.is_active) throw new HttpError(403, 'Akun Anda sedang nonaktif.')

  return {
    user: authData.user,
    userClient,
    adminClient,
    profile: profile as RequesterProfile,
  }
}
