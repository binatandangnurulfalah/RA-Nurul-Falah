import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { corsPreflight } from '../_shared/cors.ts'
import { requireAuthenticatedUser, createPublicClient } from '../_shared/auth.ts'
import { appendAccountAudit } from '../_shared/audit.ts'
import { requireRole } from '../_shared/authorization.ts'
import { jsonResponse } from '../_shared/response.ts'
import { observeEdgeFunction } from '../_shared/observability.ts'

function randomBootstrapPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `Nf!${random}aA7`
}

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

    const { data: created, error: createError } = await context.adminClient.auth.admin.createUser({
      email,
      password: randomBootstrapPassword(),
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })

    if (createError || !created.user) {
      await context.adminClient.from('account_allowlist').delete().eq('id', allow.id)
      return jsonResponse({ ok: false, error: 'Akun gagal dibuat. Periksa kembali email pengguna.' }, 400)
    }

    const publicClient = createPublicClient()
    const resetOptions = redirectTo ? { redirectTo } : undefined
    const { error: resetError } = await publicClient.auth.resetPasswordForEmail(email, resetOptions)

    let manualLink: string | null = null
    let delivery: 'email' | 'manual_link' = 'email'

    if (resetError) {
      const { data: generated, error: linkError } = await context.adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
      })
      manualLink = generated?.properties?.action_link ?? null
      if (linkError || !manualLink) {
        await context.adminClient.auth.admin.deleteUser(created.user.id)
        await context.adminClient.from('account_allowlist').delete().eq('id', allow.id)
        return jsonResponse({ ok: false, error: 'Akun tidak dapat mengirim alur pembuatan password. Konfigurasi email perlu diperiksa.' }, 503)
      }
      delivery = 'manual_link'
    }

    await appendAccountAudit(context, created.user.id, 'ACCOUNT_CREATED', {
      display_name: displayName,
      role,
      delivery,
    })

    return jsonResponse({
      ok: true,
      delivery,
      manual_link: manualLink,
      user: {
        id: created.user.id,
        email: created.user.email,
        role,
        display_name: displayName,
      },
    }, 201)
  } catch (error) {
    throw error
  }
}))
