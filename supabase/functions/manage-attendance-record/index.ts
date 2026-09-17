import { corsResponse } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/auth.ts'
import { requireRole, teacherCanAccessStudent } from '../_shared/authorization.ts'
import { errorResponse, HttpError, jsonResponse } from '../_shared/response.ts'
import { isUuid, toJakartaIso } from '../_shared/validation.ts'

const allowedStatus = ['present', 'late', 'excused', 'sick', 'absent']

function sameNullableTime(left: string | null, right: string | null) {
  if (!left && !right) return true
  if (!left || !right) return false
  return new Date(left).getTime() === new Date(right).getTime()
}

Deno.serve(async (req: Request) => {
  const preflight = corsResponse(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const { user, adminClient, profile } = await requireAuthenticatedUser(req)
    requireRole(profile, ['admin', 'teacher'], 'Hanya Admin atau Guru yang dapat mengoreksi absensi.')

    const body = await req.json()
    const action = String(body.action ?? '')
    const correctionReason = String(body.correction_reason ?? '').trim()

    const canAccessStudent = async (studentId: string) => {
      if (profile.role === 'admin') return true
      return teacherCanAccessStudent(adminClient, user.id, studentId)
    }

    if (action === 'delete') {
      const recordId = String(body.record_id ?? '').trim()
      if (!isUuid(recordId)) throw new HttpError(400, 'Data absensi tidak valid.')
      if (correctionReason.length < 3) throw new HttpError(400, 'Alasan penghapusan absensi wajib diisi.')

      const { data: existing, error: existingError } = await adminClient
        .from('attendance_records')
        .select('id,student_id')
        .eq('id', recordId)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing) throw new HttpError(404, 'Data absensi tidak ditemukan.')
      if (!(await canAccessStudent(existing.student_id))) throw new HttpError(403, 'Anda tidak memiliki akses ke kelas murid ini.')

      const correctedAt = new Date().toISOString()
      const { data: marked, error: markError } = await adminClient
        .from('attendance_records')
        .update({ correction_reason: correctionReason.slice(0, 500), last_corrected_by: user.id, last_corrected_at: correctedAt })
        .eq('id', recordId)
        .select('id')
        .maybeSingle()
      if (markError) throw markError
      if (!marked) throw new HttpError(409, 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.')

      const { data: deleted, error: deleteError } = await adminClient
        .from('attendance_records')
        .delete()
        .eq('id', recordId)
        .select('id')
        .maybeSingle()
      if (deleteError) throw deleteError
      if (!deleted) throw new HttpError(409, 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.')
      return jsonResponse({ ok: true })
    }

    if (!['create', 'update'].includes(action)) throw new HttpError(400, 'Aksi tidak dikenali.')

    const studentId = String(body.student_id ?? '').trim()
    const attendanceDate = String(body.attendance_date ?? '')
    const checkInText = body.check_in ? String(body.check_in) : null
    const checkOutText = body.check_out ? String(body.check_out) : null
    const status = String(body.status ?? 'present')

    if (!isUuid(studentId)) throw new HttpError(400, 'Murid wajib dipilih.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) throw new HttpError(400, 'Tanggal absensi tidak valid.')
    if (!allowedStatus.includes(status)) throw new HttpError(400, 'Status absensi tidak valid.')

    const checkIn = toJakartaIso(attendanceDate, checkInText)
    const checkOut = toJakartaIso(attendanceDate, checkOutText)
    if (checkInText && !checkIn) throw new HttpError(400, 'Jam masuk tidak valid.')
    if (checkOutText && !checkOut) throw new HttpError(400, 'Jam pulang tidak valid.')
    if (checkOut && !checkIn) throw new HttpError(400, 'Jam masuk wajib diisi jika jam pulang diisi.')
    if (checkIn && checkOut && new Date(checkOut).getTime() < new Date(checkIn).getTime()) {
      throw new HttpError(400, 'Jam pulang tidak boleh lebih awal dari jam masuk.')
    }

    const { data: student, error: studentError } = await adminClient
      .from('students')
      .select('id,full_name')
      .eq('id', studentId)
      .eq('is_active', true)
      .maybeSingle()
    if (studentError) throw studentError
    if (!student) throw new HttpError(404, 'Murid tidak ditemukan atau tidak aktif.')
    if (!(await canAccessStudent(studentId))) throw new HttpError(403, 'Anda hanya dapat mengelola absensi kelas yang ditugaskan.')

    if (action === 'create') {
      const { data, error } = await adminClient
        .from('attendance_records')
        .insert({
          student_id: studentId,
          attendance_date: attendanceDate,
          check_in: checkIn,
          check_out: checkOut,
          status,
          source: 'manual',
          recorded_by: user.id,
          check_in_by: checkIn ? user.id : null,
          check_out_by: checkOut ? user.id : null,
        })
        .select('id')
        .maybeSingle()
      if (error?.code === '23505') throw new HttpError(409, 'Murid sudah memiliki data absensi pada tanggal tersebut.')
      if (error) throw error
      if (!data) throw new HttpError(409, 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.')
      return jsonResponse({ ok: true, record_id: data.id, student_name: student.full_name })
    }

    const recordId = String(body.record_id ?? '').trim()
    if (!isUuid(recordId)) throw new HttpError(400, 'Data absensi tidak valid.')

    const { data: existing, error: existingError } = await adminClient
      .from('attendance_records')
      .select('student_id,attendance_date,check_in,check_out,status,check_in_by,check_out_by')
      .eq('id', recordId)
      .maybeSingle()
    if (existingError) throw existingError
    if (!existing) throw new HttpError(404, 'Data absensi tidak ditemukan.')
    if (!(await canAccessStudent(existing.student_id))) throw new HttpError(403, 'Anda tidak memiliki akses untuk mengubah data absensi ini.')

    const materiallyChanged = existing.student_id !== studentId ||
      existing.attendance_date !== attendanceDate ||
      !sameNullableTime(existing.check_in, checkIn) ||
      !sameNullableTime(existing.check_out, checkOut) ||
      existing.status !== status
    if (materiallyChanged && correctionReason.length < 3) {
      throw new HttpError(400, 'Alasan koreksi wajib diisi ketika tanggal, jam, murid, atau status absensi diubah.')
    }

    const payload: Record<string, unknown> = {
      student_id: studentId,
      attendance_date: attendanceDate,
      check_in: checkIn,
      check_out: checkOut,
      status,
      check_in_by: checkIn ? existing.check_in_by ?? user.id : null,
      check_out_by: checkOut ? existing.check_out_by ?? user.id : null,
    }
    if (materiallyChanged) {
      payload.correction_reason = correctionReason.slice(0, 500)
      payload.last_corrected_by = user.id
      payload.last_corrected_at = new Date().toISOString()
    }

    const { data: updated, error } = await adminClient
      .from('attendance_records')
      .update(payload)
      .eq('id', recordId)
      .eq('student_id', existing.student_id)
      .select('id')
      .maybeSingle()
    if (error?.code === '23505') throw new HttpError(409, 'Murid sudah memiliki data absensi pada tanggal tersebut.')
    if (error) throw error
    if (!updated) throw new HttpError(409, 'Data absensi berubah saat diproses. Muat ulang lalu coba lagi.')
    return jsonResponse({ ok: true, record_id: updated.id, student_name: student.full_name })
  } catch (error) {
    return errorResponse(error)
  }
})
