import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { corsPreflight } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { appendAccountAudit } from '../_shared/audit.ts'
import { requireRole } from '../_shared/authorization.ts'
import { jsonResponse } from '../_shared/response.ts'
import { observeEdgeFunction } from '../_shared/observability.ts'

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

Deno.serve(observeEdgeFunction('admin-create-user', async (req: Request) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authenticated = await requireAuthenticatedUser(req)
    if (!authenticated.ok) return authenticated.response
    const context = authenticated.context

    const roleError = requireRole(context, ['admin'], 'Hanya Admin yang dapat membuat akun.')
    if (roleError) return roleError

    let payload: Record<string, unknown>
    try {
      payload = await req.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Permintaan tidak valid.' }, 400)
    }

    const email = String(payload.email ?? '').trim().toLowerCase()
    const displayName = String(payload.display_name ?? '').trim()
    const role = String(payload.role ?? '')
    const redirectTo = safeRedirect(payload.redirect_to)

    if (!email || !email.includes('@')) return jsonResponse({ ok: false, error: 'Email tidak valid.' }, 400)
    if (displayName.length < 2) return jsonResponse({ ok: false, error: 'Nama pengguna wajib diisi.' }, 400)
    if (!['admin', 'teacher', 'parent'].includes(role)) return jsonResponse({ ok: false, error: 'Role tidak valid.' }, 400)

    const { data: allow, error: allowError } = await context.adminClient
      .from('account_allowlist')
      .insert({
        email,
        role,
        display_name: displayName,
        created_by: context.user.id,
      })
      .select('id')
      .single()

    if (allowError) {
      return jsonResponse({
        ok: false,
        error: allowError.code === '23505' ? 'Email sudah pernah disiapkan.' : 'Akun gagal disiapkan.',
      }, 400)
    }

    const inviteOptions = {
      data: {
        display_name: displayName,
        must_set_password: true,
      },
      ...(redirectTo ? { redirectTo } : {}),
    }
    const { data: invited, error: inviteError } = await context.adminClient.auth.admin.inviteUserByEmail(
      email,
      inviteOptions,
    )

    if (inviteError || !invited.user) {
      await context.adminClient.from('account_allowlist').delete().eq('id', allow.id)
      return jsonResponse({
        ok: false,
        error: 'Undangan akun gagal dikirim. Periksa alamat email dan konfigurasi email Supabase.',
      }, 503)
    }

    const delivery = 'invite_email'

    await appendAccountAudit(context, invited.user.id, 'ACCOUNT_CREATED', {
      display_name: displayName,
      role,
      delivery,
    })

    return jsonResponse({
      ok: true,
      delivery,
      manual_link: null,
      user: {
        id: invited.user.id,
        email: invited.user.email,
        role,
        display_name: displayName,
      },
    }, 201)
  } catch (error) {
    throw error
  }
}))
