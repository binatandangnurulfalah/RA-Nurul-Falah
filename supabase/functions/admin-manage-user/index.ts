import { createClient } from 'npm:@supabase/supabase-js@2'

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
  if (req.method !== 'POST') return json({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Silakan login kembali.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return json({ ok: false, error: 'Sesi tidak valid.' }, 401)

    const { data: requester } = await admin
      .from('user_profiles')
      .select('role,is_active')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (!requester?.is_active || requester.role !== 'admin') {
      return json({ ok: false, error: 'Hanya Admin yang dapat mengelola akun.' }, 403)
    }

    const body = await req.json()
    const action = String(body.action ?? '')
    const userId = String(body.user_id ?? '')
    if (!userId) return json({ ok: false, error: 'Akun tidak valid.' }, 400)

    if (action === 'delete') {
      if (userId === authData.user.id) return json({ ok: false, error: 'Admin tidak dapat menghapus akun yang sedang digunakan.' }, 400)
      const { data: targetData } = await admin.auth.admin.getUserById(userId)
      const email = targetData?.user?.email?.toLowerCase() ?? null
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
      if (deleteError) return json({ ok: false, error: deleteError.message }, 400)
      if (email) await admin.from('account_allowlist').delete().eq('email', email)
      return json({ ok: true })
    }

    if (action === 'update') {
      const displayName = String(body.display_name ?? '').trim()
      const role = String(body.role ?? '')
      const isActive = Boolean(body.is_active)
      const newPassword = String(body.new_password ?? '')

      if (!displayName) return json({ ok: false, error: 'Nama pengguna wajib diisi.' }, 400)
      if (!['admin', 'teacher', 'parent'].includes(role)) return json({ ok: false, error: 'Role tidak valid.' }, 400)
      if (userId === authData.user.id && (!isActive || role !== 'admin')) {
        return json({ ok: false, error: 'Admin tidak dapat menonaktifkan atau mengubah role akun yang sedang digunakan.' }, 400)
      }
      if (newPassword && (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword))) {
        return json({ ok: false, error: 'Password baru minimal 8 karakter serta berisi huruf dan angka.' }, 400)
      }

      const authPatch: { user_metadata: { display_name: string }; password?: string } = {
        user_metadata: { display_name: displayName },
      }
      if (newPassword) authPatch.password = newPassword

      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, authPatch)
      if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400)

      const { error: profileError } = await admin
        .from('user_profiles')
        .update({ display_name: displayName, role, is_active: isActive })
        .eq('id', userId)
      if (profileError) return json({ ok: false, error: profileError.message }, 400)

      const { data: targetData } = await admin.auth.admin.getUserById(userId)
      const email = targetData?.user?.email?.toLowerCase() ?? null
      if (email) {
        await admin.from('account_allowlist').update({ display_name: displayName, role, is_active: isActive }).eq('email', email)
      }
      return json({ ok: true })
    }

    return json({ ok: false, error: 'Aksi tidak dikenali.' }, 400)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan server.' }, 500)
  }
})
