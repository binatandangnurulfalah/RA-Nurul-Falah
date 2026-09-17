import { corsResponse } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole } from '../_shared/authorization.ts'
import { errorResponse, HttpError, jsonResponse } from '../_shared/response.ts'
import { isUuid } from '../_shared/validation.ts'

Deno.serve(async (req: Request) => {
  const preflight = corsResponse(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const { user, adminClient, profile } = await requireAuthenticatedUser(req)
    requireRole(profile, ['admin'], 'Hanya Admin yang dapat mengelola akun.')

    const body = await req.json()
    const action = String(body.action ?? '')
    const userId = String(body.user_id ?? '').trim()
    if (!isUuid(userId)) throw new HttpError(400, 'Akun tidak valid.')

    if (action === 'send_password_reset') {
      const { data: target, error: targetError } = await adminClient.auth.admin.getUserById(userId)
      if (targetError || !target.user?.email) throw new HttpError(404, 'Email akun tidak ditemukan.')
      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(target.user.email)
      if (resetError) throw new HttpError(400, 'Email reset password gagal dikirim. Periksa konfigurasi email Auth.')
      return jsonResponse({ ok: true, message: 'Email reset password berhasil dikirim.' })
    }

    if (action === 'delete') {
      if (userId === user.id) throw new HttpError(400, 'Admin tidak dapat menghapus akun yang sedang digunakan.')
      const { data: targetData } = await adminClient.auth.admin.getUserById(userId)
      const email = targetData?.user?.email?.toLowerCase() ?? null
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
      if (deleteError) throw new HttpError(400, 'Akun gagal dihapus.')
      if (email) await adminClient.from('account_allowlist').delete().eq('email', email)
      return jsonResponse({ ok: true })
    }

    if (action === 'update') {
      const displayName = String(body.display_name ?? '').trim()
      const role = String(body.role ?? '')
      const isActive = Boolean(body.is_active)

      if (displayName.length < 2) throw new HttpError(400, 'Nama pengguna wajib diisi.')
      if (!['admin', 'teacher', 'parent'].includes(role)) throw new HttpError(400, 'Role tidak valid.')
      if (userId === user.id && (!isActive || role !== 'admin')) {
        throw new HttpError(400, 'Admin tidak dapat menonaktifkan atau mengubah role akun yang sedang digunakan.')
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { display_name: displayName },
      })
      if (authUpdateError) throw new HttpError(400, 'Profil login gagal diperbarui.')

      const { data: updatedProfile, error: profileError } = await adminClient
        .from('user_profiles')
        .update({ display_name: displayName, role, is_active: isActive })
        .eq('id', userId)
        .select('id')
        .maybeSingle()
      if (profileError) throw profileError
      if (!updatedProfile) throw new HttpError(409, 'Akun berubah saat diproses. Muat ulang lalu coba lagi.')

      const { data: targetData } = await adminClient.auth.admin.getUserById(userId)
      const email = targetData?.user?.email?.toLowerCase() ?? null
      if (email) {
        await adminClient
          .from('account_allowlist')
          .update({ display_name: displayName, role, is_active: isActive })
          .eq('email', email)
      }
      return jsonResponse({ ok: true })
    }

    throw new HttpError(400, 'Aksi tidak dikenali.')
  } catch (error) {
    return errorResponse(error)
  }
})
