import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { corsPreflight } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole, teacherCanAccessStudent } from '../_shared/authorization.ts'
import { jsonResponse } from '../_shared/response.ts'
import { isIsoDate, isUuid, normalizeCorrectionReason } from '../_shared/validation.ts'

const ALLOWED_STATUS = ['present', 'late', 'excused', 'sick', 'absent']

function toIso(date: string, time: string | null) {
  if (!time) return null
  const normalized = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  const value = new Date(`${date}T${normalized}+07:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

function sameInstant(left: string | null, right: string | null) {
  if (!left && !right) return true
  if (!left || !right) return false
  return new Date(left).getTime() === new Date(right).getTime()
}

Deno.serve(async (req: Request) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authenticated = await requireAuthenticatedUser(req)
    if (!authenticated.ok) return authenticated.response
    const context = authenticated.context

    const roleError = requireRole(context, ['admin', 'teacher'], 'Hanya Admin atau Guru yang dapat mengoreksi absensi.')
    if (roleError) return roleError

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Permintaan tidak valid.' }, 400)
    }

    const action = String(body.action ?? '')
    const correctionReason = normalizeCorrectionReason(body.correction_reason)

    if (action === 'delete') {
      const recordId = String(body.record_id ?? '').trim()
      if (!isUuid(recordId)) return jsonResponse({ ok: false, error: 'Data absensi tidak valid.' }, 400)
      if (correctionReason.length < 3) {
        return jsonResponse({ ok: false, error: 'Alasan penghapusan wajib diisi minimal 3 karakter.' }, 400)
      }

      const { data: existing, error: existingError } = await context.adminClient
        .from('attendance_records')
        .select('student_id')
        .eq('id', recordId)
        .maybeSingle()

      if (existingError) return jsonResponse({ ok: false, error: 'Data absensi gagal diperiksa.' }, 400)
      if (!existing) return jsonResponse({ ok: false, error: 'Data absensi tidak ditemukan.' }, 404)
      if (!(await teacherCanAccessStudent(context, existing.student_id))) {
        return jsonResponse({ ok: false, error: 'Anda tidak memiliki akses ke kelas murid ini.' }, 403)
      }

      const correctedAt = new Date().toISOString()
      const { data: marked, error: markError } = await context.adminClient
        .from('attendance_records')
        .update({
          last_corrected_by: context.user.id,
          correction_reason: correctionReason,
          last_corrected_at: correctedAt,
        })
        .eq('id', recordId)
        .eq('student_id', existing.student_id)
        .select('id')
        .maybeSingle()

      if (markError || !marked) {
        return jsonResponse({ ok: false, error: 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.' }, 409)
      }

      const { data: deleted, error: deleteError } = await context.adminClient
        .from('attendance_records')
        .delete()
        .eq('id', recordId)
        .eq('student_id', existing.student_id)
        .select('id')
        .maybeSingle()

      if (deleteError || !deleted) {
        return jsonResponse({ ok: false, error: 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.' }, 409)
      }
      return jsonResponse({ ok: true, record_id: deleted.id })
    }

    if (!['create', 'update'].includes(action)) {
      return jsonResponse({ ok: false, error: 'Aksi tidak dikenali.' }, 400)
    }

    const studentId = String(body.student_id ?? '').trim()
    const attendanceDate = String(body.attendance_date ?? '')
    const checkInText = body.check_in ? String(body.check_in) : null
    const checkOutText = body.check_out ? String(body.check_out) : null
    const status = String(body.status ?? 'present')

    if (!isUuid(studentId)) return jsonResponse({ ok: false, error: 'Murid wajib dipilih.' }, 400)
    if (!isIsoDate(attendanceDate)) return jsonResponse({ ok: false, error: 'Tanggal absensi tidak valid.' }, 400)
    if (!ALLOWED_STATUS.includes(status)) return jsonResponse({ ok: false, error: 'Status absensi tidak valid.' }, 400)

    const checkIn = toIso(attendanceDate, checkInText)
    const checkOut = toIso(attendanceDate, checkOutText)
    if (checkInText && !checkIn) return jsonResponse({ ok: false, error: 'Jam masuk tidak valid.' }, 400)
    if (checkOutText && !checkOut) return jsonResponse({ ok: false, error: 'Jam pulang tidak valid.' }, 400)
    if (checkOut && !checkIn) return jsonResponse({ ok: false, error: 'Jam masuk wajib diisi jika jam pulang diisi.' }, 400)
    if (checkIn && checkOut && new Date(checkOut).getTime() < new Date(checkIn).getTime()) {
      return jsonResponse({ ok: false, error: 'Jam pulang tidak boleh lebih awal dari jam masuk.' }, 400)
    }

    const { data: student } = await context.adminClient
      .from('students')
      .select('id,full_name')
      .eq('id', studentId)
      .eq('is_active', true)
      .maybeSingle()

    if (!student) return jsonResponse({ ok: false, error: 'Murid tidak ditemukan atau tidak aktif.' }, 404)
    if (!(await teacherCanAccessStudent(context, studentId))) {
      return jsonResponse({ ok: false, error: 'Anda hanya dapat mengelola absensi kelas yang ditugaskan.' }, 403)
    }

    if (action === 'create') {
      const { data, error } = await context.adminClient
        .from('attendance_records')
        .insert({
          student_id: studentId,
          attendance_date: attendanceDate,
          check_in: checkIn,
          check_out: checkOut,
          status,
          source: 'manual',
          recorded_by: context.user.id,
          check_in_by: checkIn ? context.user.id : null,
          check_out_by: checkOut ? context.user.id : null,
        })
        .select('id')
        .single()

      if (error) {
        return jsonResponse({
          ok: false,
          error: error.code === '23505'
            ? 'Murid sudah memiliki data absensi pada tanggal tersebut.'
            : 'Data absensi gagal disimpan.',
        }, 400)
      }
      return jsonResponse({ ok: true, record_id: data.id, student_name: student.full_name })
    }

    const recordId = String(body.record_id ?? '').trim()
    if (!isUuid(recordId)) return jsonResponse({ ok: false, error: 'Data absensi tidak valid.' }, 400)

    const { data: existing, error: existingError } = await context.adminClient
      .from('attendance_records')
      .select('student_id,attendance_date,check_in,check_out,status,check_in_by,check_out_by')
      .eq('id', recordId)
      .maybeSingle()

    if (existingError) return jsonResponse({ ok: false, error: 'Data absensi gagal diperiksa.' }, 400)
    if (!existing) return jsonResponse({ ok: false, error: 'Data absensi tidak ditemukan.' }, 404)
    if (!(await teacherCanAccessStudent(context, existing.student_id))) {
      return jsonResponse({ ok: false, error: 'Anda tidak memiliki akses untuk mengubah data absensi ini.' }, 403)
    }

    const hasCorrection = existing.student_id !== studentId
      || existing.attendance_date !== attendanceDate
      || !sameInstant(existing.check_in, checkIn)
      || !sameInstant(existing.check_out, checkOut)
      || existing.status !== status

    if (hasCorrection && correctionReason.length < 3) {
      return jsonResponse({ ok: false, error: 'Alasan koreksi wajib diisi minimal 3 karakter.' }, 400)
    }

    const payload: Record<string, unknown> = {
      student_id: studentId,
      attendance_date: attendanceDate,
      check_in: checkIn,
      check_out: checkOut,
      status,
    }

    if (!existing.check_in && checkIn) payload.check_in_by = context.user.id
    if (existing.check_in && !checkIn) payload.check_in_by = null
    if (!existing.check_out && checkOut) payload.check_out_by = context.user.id
    if (existing.check_out && !checkOut) payload.check_out_by = null

    if (hasCorrection) {
      payload.last_corrected_by = context.user.id
      payload.correction_reason = correctionReason
      payload.last_corrected_at = new Date().toISOString()
    }

    const { data: updated, error } = await context.adminClient
      .from('attendance_records')
      .update(payload)
      .eq('id', recordId)
      .eq('student_id', existing.student_id)
      .select('id')
      .maybeSingle()

    if (error) {
      return jsonResponse({
        ok: false,
        error: error.code === '23505'
          ? 'Murid sudah memiliki data absensi pada tanggal tersebut.'
          : 'Data absensi gagal diperbarui.',
      }, 400)
    }
    if (!updated) return jsonResponse({ ok: false, error: 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.' }, 409)

    return jsonResponse({ ok: true, record_id: updated.id, student_name: student.full_name })
  } catch {
    return jsonResponse({ ok: false, error: 'Terjadi kesalahan server.' }, 500)
  }
})
