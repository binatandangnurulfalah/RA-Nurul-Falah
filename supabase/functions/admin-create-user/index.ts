import { corsResponse } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole } from '../_shared/authorization.ts'
import { errorResponse, HttpError, jsonResponse } from '../_shared/response.ts'
import { createTemporaryPassword, isEmail } from '../_shared/validation.ts'

Deno.serve(async (req: Request) => {
  const preflight = corsResponse(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const { user, adminClient, profile } = await requireAuthenticatedUser(req)
    requireRole(profile, ['admin'], 'Hanya Admin yang dapat membuat akun.')

    const payload = await req.json()
    const email = String(payload.email ?? '').trim().toLowerCase()
    const displayName = String(payload.display_name ?? '').trim()
    const role = String(payload.role ?? '')

    if (!isEmail(email)) throw new HttpError(400, 'Email tidak valid.')
    if (displayName.length < 2) throw new HttpError(400, 'Nama pengguna wajib diisi.')
    if (!['admin', 'teacher', 'parent'].includes(role)) throw new HttpError(400, 'Role tidak valid.')

    const { data: allow, error: allowError } = await adminClient
      .from('account_allowlist')
      .insert({ email, role, display_name: displayName, created_by: user.id })
      .select('id')
      .single()

    if (allowError) {
      throw new HttpError(400, allowError.code === '23505' ? 'Email sudah pernah disiapkan.' : 'Akun gagal disiapkan.')
    }

    const temporaryPassword = createTemporaryPassword()
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })

    if (createError || !created.user) {
      await adminClient.from('account_allowlist').delete().eq('id', allow.id)
      throw new HttpError(400, createError?.message?.includes('already') ? 'Email sudah terdaftar.' : 'Akun gagal dibuat.')
    }

    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email)

    return jsonResponse({
      ok: true,
      delivery: resetError ? 'email_pending_configuration' : 'reset_email_sent',
      message: resetError
        ? 'Akun berhasil dibuat. Email reset belum dapat dikirim; konfigurasi email perlu diperiksa sebelum pengguna dapat membuat password sendiri.'
        : 'Akun berhasil dibuat. Pengguna akan menentukan password sendiri melalui email reset.',
      user: {
        id: created.user.id,
        email: created.user.email,
        role,
        display_name: displayName,
      },
    }, 201)
  } catch (error) {
    return errorResponse(error)
  }
})
