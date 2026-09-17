import { createClient } from 'npm:@supabase/supabase-js@2'
import { validatePassword } from '../_shared/password-policy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile, error: profileError } = await userClient
      .from('user_profiles')
      .select('role,is_active')
      .eq('id', userData.user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin' || !profile.is_active) {
      return json({ error: 'Admin access required' }, 403)
    }

    const payload = await req.json()
    const email = String(payload.email ?? '').trim().toLowerCase()
    const password = String(payload.password ?? '')
    const displayName = String(payload.display_name ?? '').trim()
    const role = String(payload.role ?? '')

    if (!email || !email.includes('@')) return json({ error: 'Email tidak valid' }, 400)
    const passwordError = validatePassword(password)
    if (passwordError) return json({ error: passwordError }, 400)
    if (!['admin', 'teacher', 'parent'].includes(role)) return json({ error: 'Role tidak valid' }, 400)

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: allow, error: allowError } = await admin
      .from('account_allowlist')
      .insert({
        email,
        role,
        display_name: displayName || null,
        created_by: userData.user.id,
      })
      .select('id')
      .single()

    if (allowError) {
      return json({
        error: allowError.code === '23505' ? 'Email sudah pernah disiapkan' : allowError.message,
      }, 400)
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || null },
    })

    if (createError || !created.user) {
      await admin.from('account_allowlist').delete().eq('id', allow.id)
      return json({ error: createError?.message ?? 'Gagal membuat akun' }, 400)
    }

    return json({
      ok: true,
      user: {
        id: created.user.id,
        email: created.user.email,
        role,
        display_name: displayName || null,
      },
    }, 201)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Terjadi kesalahan server' }, 500)
  }
})
