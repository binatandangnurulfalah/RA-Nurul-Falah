import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { corsPreflight } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole, teacherCanAccessStudent } from '../_shared/authorization.ts'
import { jsonResponse } from '../_shared/response.ts'
import { isUuid } from '../_shared/validation.ts'

Deno.serve(async (req: Request) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authenticated = await requireAuthenticatedUser(req)
    if (!authenticated.ok) return authenticated.response
    const context = authenticated.context

    const roleError = requireRole(context, ['admin', 'teacher'], 'Hanya Admin atau Guru yang dapat mencatat absensi.')
    if (roleError) return roleError

    let body: { token?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ ok: false, error: 'QR tidak valid.' }, 400)
    }

    const raw = String(body.token ?? '').trim()
    const token = raw.startsWith('RA-NF:') ? raw.slice(6) : raw
    if (!isUuid(token)) return jsonResponse({ ok: false, error: 'Kode QR tidak dikenali.' }, 400)

    const { data: student, error: studentError } = await context.adminClient
      .from('students')
      .select('id,full_name,class_name,is_active')
      .eq('qr_token', token)
      .maybeSingle()

    if (studentError || !student?.is_active) {
      return jsonResponse({ ok: false, error: 'Data murid tidak ditemukan atau tidak aktif.' }, 404)
    }
    if (!(await teacherCanAccessStudent(context, student.id))) {
      return jsonResponse({ ok: false, error: 'Anda hanya dapat memindai QR murid dari kelas yang ditugaskan.' }, 403)
    }

    const now = new Date()
    const { data: settings } = await context.adminClient
      .from('school_settings')
      .select('timezone,late_cutoff')
      .eq('id', 1)
      .maybeSingle()

    const timezone = settings?.timezone || 'Asia/Jakarta'
    const lateCutoff = String(settings?.late_cutoff || '07:15:00').slice(0, 5)
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now)
    const status = time > lateCutoff ? 'late' : 'present'

    const { data: existing, error: existingError } = await context.adminClient
      .from('attendance_records')
      .select('id,check_in,check_out,status')
      .eq('student_id', student.id)
      .eq('attendance_date', date)
      .maybeSingle()

    if (existingError) {
      return jsonResponse({ ok: false, error: 'Status absensi gagal diperiksa. Silakan pindai ulang.' }, 409)
    }

    if (!existing) {
      const { data: created, error } = await context.adminClient
        .from('attendance_records')
        .insert({
          student_id: student.id,
          attendance_date: date,
          check_in: now.toISOString(),
          status,
          source: 'qr',
          recorded_by: context.user.id,
          check_in_by: context.user.id,
        })
        .select('id')
        .maybeSingle()

      if (error || !created) {
        return jsonResponse({ ok: false, error: 'Absensi gagal disimpan. Silakan pindai ulang.' }, 409)
      }
      return jsonResponse({ ok: true, action: 'check_in', record_id: created.id, student, time, status, late_cutoff: lateCutoff })
    }

    if (!existing.check_in) {
      return jsonResponse({ ok: false, error: 'Data absensi hari ini sudah ada dan perlu diperiksa secara manual.' }, 409)
    }

    if (!existing.check_out) {
      if (now.getTime() - new Date(existing.check_in).getTime() < 120000) {
        return jsonResponse({ ok: false, error: 'Murid baru saja absen masuk. Tunggu 2 menit untuk absen pulang.' }, 409)
      }

      const { data: updated, error } = await context.adminClient
        .from('attendance_records')
        .update({ check_out: now.toISOString(), check_out_by: context.user.id })
        .eq('id', existing.id)
        .is('check_out', null)
        .select('id')
        .maybeSingle()

      if (error) return jsonResponse({ ok: false, error: 'Jam pulang gagal disimpan.' }, 409)
      if (!updated) {
        return jsonResponse({ ok: false, error: 'Absensi baru saja diperbarui dari perangkat lain. Muat ulang status.' }, 409)
      }

      return jsonResponse({
        ok: true,
        action: 'check_out',
        record_id: updated.id,
        student,
        time,
        status: existing.status,
        late_cutoff: lateCutoff,
      })
    }

    return jsonResponse({ ok: false, error: 'Absensi masuk dan pulang hari ini sudah lengkap.' }, 409)
  } catch {
    return jsonResponse({ ok: false, error: 'Terjadi kesalahan server.' }, 500)
  }
})
