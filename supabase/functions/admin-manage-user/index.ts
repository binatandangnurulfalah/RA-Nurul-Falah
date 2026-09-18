import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { corsPreflight } from '../_shared/cors.ts'
import { createPublicClient, requireAuthenticatedUser } from '../_shared/auth.ts'
import { appendAccountAudit } from '../_shared/audit.ts'
import { requireRole } from '../_shared/authorization.ts'
import { jsonResponse } from '../_shared/response.ts'
import { observeEdgeFunction } from '../_shared/observability.ts'
import { isUuid } from '../_shared/validation.ts'

function safeRedirect(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

Deno.serve(observeEdgeFunction('admin-manage-user', async (req: Request) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authenticated = await requireAuthenticatedUser(req)
    if (!authenticated.ok) return authenticated.response
    const context = authenticated.context

    const roleError = requireRole(context, ['admin'], 'Hanya Admin yang dapat mengelola akun.')
    if (roleError) return roleError

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Permintaan tidak valid.' }, 400)
    }

    const action = String(body.action ?? '')
    const userId = String(body.user_id ?? '').trim()
    if (!isUuid(userId)) return jsonResponse({ ok: false, error: 'Akun tidak valid.' }, 400)

    if (action === 'delete') {
      if (userId === context.user.id) {
        return jsonResponse({ ok: false, error: 'Admin tidak dapat menghapus akun yang sedang digunakan.' }, 400)
      }

      const [{ data: targetData }, { data: targetProfile }] = await Promise.all([
        context.adminClient.auth.admin.getUserById(userId),
        context.adminClient.from('user_profiles').select('display_name,role,is_active').eq('id', userId).maybeSingle(),
      ])
      const email = targetData?.user?.email?.toLowerCase() ?? null
      const { error: deleteError } = await context.adminClient.auth.admin.deleteUser(userId)
      if (deleteError) return jsonResponse({ ok: false, error: 'Akun gagal dihapus.' }, 400)
      if (email) await context.adminClient.from('account_allowlist').delete().eq('email', email)

      await appendAccountAudit(context, userId, 'ACCOUNT_DELETED', {
        display_name: targetProfile?.display_name ?? null,
        role: targetProfile?.role ?? null,
        was_active: targetProfile?.is_active ?? null,
      })
      return jsonResponse({ ok: true })
    }

    if (action === 'send_password_reset') {
      const { data: targetData, error: targetError } = await context.adminClient.auth.admin.getUserById(userId)
      const email = targetData?.user?.email?.toLowerCase()
      if (targetError || !email) return jsonResponse({ ok: false, error: 'Email akun tidak ditemukan.' }, 404)

      const redirectTo = safeRedirect(body.redirect_to)
      const publicClient = createPublicClient()
      const resetOptions = redirectTo ? { redirectTo } : undefined
      const { error: resetError } = await publicClient.auth.resetPasswordForEmail(email, resetOptions)

      if (!resetError) {
        await appendAccountAudit(context, userId, 'PASSWORD_RESET_REQUESTED', { delivery: 'email' })
        return jsonResponse({ ok: true, delivery: 'email' })
      }

      const { data: generated, error: linkError } = await context.adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
      })
      const manualLink = generated?.properties?.action_link ?? null
      if (linkError || !manualLink) {
        return jsonResponse({ ok: false, error: 'Reset password tidak dapat dikirim. Konfigurasi email perlu diperiksa.' }, 503)
      }
      await appendAccountAudit(context, userId, 'PASSWORD_RESET_REQUESTED', { delivery: 'manual_link' })
      return jsonResponse({ ok: true, delivery: 'manual_link', manual_link: manualLink })
    }

    if (action === 'update') {
      const displayName = String(body.display_name ?? '').trim()
      const role = String(body.role ?? '')
      const isActive = Boolean(body.is_active)

      if (!displayName) return jsonResponse({ ok: false, error: 'Nama pengguna wajib diisi.' }, 400)
      if (!['admin', 'teacher', 'parent'].includes(role)) return jsonResponse({ ok: false, error: 'Role tidak valid.' }, 400)
      if (userId === context.user.id && (!isActive || role !== 'admin')) {
        return jsonResponse({ ok: false, error: 'Admin tidak dapat menonaktifkan atau mengubah role akun yang sedang digunakan.' }, 400)
      }

      const { data: previousProfile, error: previousProfileError } = await context.adminClient
        .from('user_profiles')
        .select('display_name,role,is_active')
        .eq('id', userId)
        .maybeSingle()
      if (previousProfileError || !previousProfile) {
        return jsonResponse({ ok: false, error: 'Profil pengguna tidak ditemukan.' }, 404)
      }

      const authAttributes = {
        user_metadata: { display_name: displayName },
        ban_duration: isActive ? 'none' : '876000h',
      }
      const rollbackAuth = () => context.adminClient.auth.admin.updateUserById(userId, {
        user_metadata: { display_name: previousProfile.display_name ?? '' },
        ban_duration: previousProfile.is_active ? 'none' : '876000h',
      })

      const { error: authUpdateError } = await context.adminClient.auth.admin.updateUserById(userId, authAttributes)
      if (authUpdateError) return jsonResponse({ ok: false, error: 'Status login pengguna gagal diperbarui.' }, 400)

      const { error: profileError } = await context.adminClient
        .from('user_profiles')
        .update({ display_name: displayName, role, is_active: isActive })
        .eq('id', userId)
      if (profileError) {
        await rollbackAuth()
        return jsonResponse({ ok: false, error: 'Profil pengguna gagal diperbarui.' }, 400)
      }

      const { data: targetData } = await context.adminClient.auth.admin.getUserById(userId)
      const email = targetData?.user?.email?.toLowerCase() ?? null
      if (email) {
        const { error: allowlistError } = await context.adminClient
          .from('account_allowlist')
          .update({ display_name: displayName, role, is_active: isActive })
          .eq('email', email)
        if (allowlistError) {
          await context.adminClient
            .from('user_profiles')
            .update({
              display_name: previousProfile.display_name,
              role: previousProfile.role,
              is_active: previousProfile.is_active,
            })
            .eq('id', userId)
          await rollbackAuth()
          return jsonResponse({ ok: false, error: 'Status akun gagal disinkronkan.' }, 500)
        }
      }

      await appendAccountAudit(context, userId, 'ACCOUNT_UPDATED', {
        display_name: displayName,
        role,
        is_active: isActive,
        auth_banned: !isActive,
      })
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: false, error: 'Aksi tidak dikenali.' }, 400)
  } catch (error) {
    throw error
  }
}))
