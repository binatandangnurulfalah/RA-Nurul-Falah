import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { jsonResponse } from './response.ts'

export type AppRole = 'admin' | 'teacher' | 'parent'

export type AuthContext = {
  user: { id: string; email?: string }
  profile: { role: AppRole; is_active: boolean }
  userClient: ReturnType<typeof createClient>
  adminClient: ReturnType<typeof createClient>
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Konfigurasi server ${name} belum tersedia.`)
  return value
}

export function createAdminClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function createPublicClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function requireAuthenticatedUser(req: Request): Promise<
  { ok: true; context: AuthContext } | { ok: false; response: Response }
> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Silakan login kembali.' }, 401) }
  }

  const jwt = authorization.slice('Bearer '.length).trim()
  if (!jwt) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Silakan login kembali.' }, 401) }
  }

  const userClient = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const adminClient = createAdminClient()

  const { data: authData, error: authError } = await userClient.auth.getUser(jwt)
  if (authError || !authData.user) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Sesi tidak valid. Silakan login kembali.' }, 401) }
  }

  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('role,is_active')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Profil pengguna tidak ditemukan.' }, 403) }
  }
  if (!profile.is_active) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Akun tidak aktif.' }, 403) }
  }

  if (profile.role === 'admin') {
    const { data: assurance, error: assuranceError } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt)
    if (assuranceError || assurance.currentLevel !== 'aal2') {
      return {
        ok: false,
        response: jsonResponse({
          ok: false,
          code: 'MFA_REQUIRED',
          error: 'Administrator wajib menyelesaikan verifikasi MFA sebelum menggunakan fungsi ini.',
        }, 403),
      }
    }
  }

  return {
    ok: true,
    context: {
      user: { id: authData.user.id, email: authData.user.email },
      profile: { role: profile.role as AppRole, is_active: profile.is_active },
      userClient,
      adminClient,
    },
  }
}
