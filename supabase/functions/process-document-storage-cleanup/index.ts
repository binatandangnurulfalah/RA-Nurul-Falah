import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { corsPreflight } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole } from '../_shared/authorization.ts'
import { jsonResponse } from '../_shared/response.ts'

const DOCUMENT_BUCKET = 'school-documents'
const MAX_BATCH = 25

type CleanupRow = {
  id: string
  object_path: string
  attempts: number
}

function retryAt(attempts: number) {
  const minutes = Math.min(60, 2 ** Math.min(Math.max(attempts, 1), 6))
  return new Date(Date.now() + (minutes * 60_000)).toISOString()
}

Deno.serve(async (req: Request) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authenticated = await requireAuthenticatedUser(req)
    if (!authenticated.ok) return authenticated.response
    const context = authenticated.context

    const roleError = requireRole(context, ['admin'], 'Hanya Admin yang dapat memproses cleanup dokumen.')
    if (roleError) return roleError

    let body: { object_path?: string } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const objectPath = String(body.object_path ?? '').trim()
    if (objectPath) {
      const { error: enqueueError } = await context.userClient.rpc('enqueue_school_document_storage_cleanup', {
        p_object_path: objectPath,
      })
      if (enqueueError) {
        return jsonResponse({
          ok: false,
          error: enqueueError.message.includes('masih direferensikan')
            ? 'File masih digunakan oleh dokumen aktif.'
            : 'File tidak dapat dimasukkan ke antrean cleanup.',
        }, enqueueError.code === '23503' ? 409 : 400)
      }
    }

    const { data: claimed, error: claimError } = await context.adminClient.rpc(
      'claim_school_document_storage_cleanup',
      { p_limit: MAX_BATCH },
    )
    if (claimError) {
      return jsonResponse({ ok: false, error: 'Antrean cleanup tidak dapat diproses.' }, 500)
    }

    const rows = (claimed as CleanupRow[] | null) ?? []
    let processed = 0
    let failed = 0
    let skipped = 0

    for (const row of rows) {
      const { data: references, error: referenceError } = await context.adminClient
        .from('school_documents')
        .select('id')
        .eq('storage_path', row.object_path)
        .limit(1)

      if (referenceError) {
        failed += 1
        await context.adminClient
          .from('school_document_storage_cleanup')
          .update({
            attempts: row.attempts + 1,
            last_error: referenceError.message.slice(0, 1000),
            next_attempt_at: retryAt(row.attempts + 1),
            locked_until: null,
          })
          .eq('id', row.id)
        continue
      }

      if ((references ?? []).length > 0) {
        skipped += 1
        await context.adminClient
          .from('school_document_storage_cleanup')
          .delete()
          .eq('id', row.id)
        continue
      }

      const removal = await context.adminClient.storage
        .from(DOCUMENT_BUCKET)
        .remove([row.object_path])

      if (removal.error) {
        failed += 1
        await context.adminClient
          .from('school_document_storage_cleanup')
          .update({
            attempts: row.attempts + 1,
            last_error: removal.error.message.slice(0, 1000),
            next_attempt_at: retryAt(row.attempts + 1),
            locked_until: null,
          })
          .eq('id', row.id)
        continue
      }

      const { error: queueDeleteError } = await context.adminClient
        .from('school_document_storage_cleanup')
        .delete()
        .eq('id', row.id)

      if (queueDeleteError) {
        failed += 1
        await context.adminClient
          .from('school_document_storage_cleanup')
          .update({
            attempts: row.attempts + 1,
            last_error: queueDeleteError.message.slice(0, 1000),
            next_attempt_at: retryAt(row.attempts + 1),
            locked_until: null,
          })
          .eq('id', row.id)
        continue
      }

      processed += 1
    }

    const { count: pending } = await context.adminClient
      .from('school_document_storage_cleanup')
      .select('id', { count: 'exact', head: true })

    return jsonResponse({
      ok: true,
      processed,
      failed,
      skipped,
      pending: pending ?? 0,
    })
  } catch {
    return jsonResponse({ ok: false, error: 'Terjadi kesalahan server.' }, 500)
  }
})
