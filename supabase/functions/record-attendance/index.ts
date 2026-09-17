import { corsResponse } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole, teacherCanAccessStudent } from '../_shared/authorization.ts'
import { errorResponse, HttpError, jsonResponse } from '../_shared/response.ts'
import { isUuid, normalizeQrToken } from '../_shared/validation.ts'

Deno.serve(async (req: Request) => {
  const preflight = corsResponse(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const { user, adminClient, profile } = await requireAuthenticatedUser(req)
    requireRole(profile, ['admin', 'teacher'], 'Hanya Admin atau Guru yang dapat mencatat absensi.')

    let body: { token?: string }
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'QR tidak valid.')
    }

    const token = normalizeQrToken(body.token)
    if (!isUuid(token)) throw new HttpError(400, 'Kode QR tidak dikenali.')

    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id,full_name,class_name,is_active')
      .eq('qr_token', token)
      .maybeSingle()

    if (studentError) throw studentError
    if (!student?.is_active) throw new HttpError(404, 'Data murid tidak ditemukan atau tidak aktif.')

    if (profile.role === 'teacher' && !(await teacherCanAccessStudent(adminClient, user.id, student.id))) {
      throw new HttpError(403, 'Anda hanya dapat memindai QR murid dari kelas yang ditugaskan.')
    }

    const now = new Date()
    const { data: settings } = await adminClient
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

    const { data: existing, error: existingError } = await adminClient
      .from('attendance_records')
      .select('id,check_in,check_out,status')
      .eq('student_id', student.id)
      .eq('attendance_date', date)
      .maybeSingle()
    if (existingError) throw existingError

    if (!existing) {
      const { data: inserted, error } = await adminClient
        .from('attendance_records')
        .insert({
          student_id: student.id,
          attendance_date: date,
          check_in: now.toISOString(),
          status,
          source: 'qr',
          recorded_by: user.id,
          check_in_by: user.id,
        })
        .select('id')
        .maybeSingle()

      if (error || !inserted) {
        throw new HttpError(409, 'Absensi baru saja diperbarui dari perangkat lain. Muat ulang status.')
      }
      return jsonResponse({ ok: true, action: 'check_in', student, time, status, late_cutoff: lateCutoff })
    }

    if (!existing.check_out) {
      if (!existing.check_in) throw new HttpError(409, 'Data absensi hari ini perlu dikoreksi manual sebelum scan dilanjutkan.')
      if (now.getTime() - new Date(existing.check_in).getTime() < 120000) {
        throw new HttpError(409, 'Murid baru saja absen masuk. Tunggu 2 menit untuk absen pulang.')
      }

      const { data: updated, error } = await adminClient
        .from('attendance_records')
        .update({ check_out: now.toISOString(), check_out_by: user.id })
        .eq('id', existing.id)
        .is('check_out', null)
        .select('id')
        .maybeSingle()

      if (error) throw new HttpError(409, 'Jam pulang gagal disimpan.')
      if (!updated) throw new HttpError(409, 'Absensi baru saja diperbarui dari perangkat lain. Muat ulang status.')

      return jsonResponse({ ok: true, action: 'check_out', student, time, status: existing.status, late_cutoff: lateCutoff })
    }

    throw new HttpError(409, 'Absensi masuk dan pulang hari ini sudah lengkap.')
  } catch (error) {
    return errorResponse(error)
  }
})
