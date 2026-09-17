import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function toIso(date: string, time: string | null) {
  if (!time) return null
  const normalized = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  const value = new Date(`${date}T${normalized}+07:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Metode tidak diizinkan.' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Silakan login kembali.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData.user) return json({ ok: false, error: 'Sesi tidak valid.' }, 401)

    const { data: profile } = await admin.from('user_profiles').select('role,is_active').eq('id', authData.user.id).maybeSingle()
    if (!profile?.is_active || !['admin', 'teacher'].includes(profile.role)) {
      return json({ ok: false, error: 'Hanya Admin atau Guru yang dapat mengoreksi absensi.' }, 403)
    }

    const body = await req.json()
    const action = String(body.action ?? '')
    const allowedStatus = ['present', 'late', 'excused', 'sick', 'absent']

    const teacherCanAccessStudent = async (studentId: string) => {
      if (profile.role === 'admin') return true
      const { data: student } = await admin.from('students').select('class_name').eq('id', studentId).maybeSingle()
      if (!student?.class_name) return false
      const { data: teacher } = await admin.from('teacher_profiles').select('id').eq('teacher_user_id', authData.user.id).maybeSingle()
      if (!teacher) return false
      const { data: schoolClass } = await admin.from('school_classes').select('id').eq('name', student.class_name).eq('is_active', true).maybeSingle()
      if (!schoolClass) return false
      const { data: assignment } = await admin.from('teacher_class_assignments').select('class_id').eq('class_id', schoolClass.id).eq('teacher_profile_id', teacher.id).maybeSingle()
      return Boolean(assignment)
    }

    if (action === 'delete') {
      const recordId = String(body.record_id ?? '')
      if (!recordId) return json({ ok: false, error: 'Data absensi tidak valid.' }, 400)
      const { data: existing } = await admin.from('attendance_records').select('student_id').eq('id', recordId).maybeSingle()
      if (!existing || !(await teacherCanAccessStudent(existing.student_id))) return json({ ok: false, error: 'Anda tidak memiliki akses ke kelas murid ini.' }, 403)
      const { error } = await admin.from('attendance_records').delete().eq('id', recordId)
      if (error) return json({ ok: false, error: error.message }, 400)
      return json({ ok: true })
    }

    if (!['create', 'update'].includes(action)) return json({ ok: false, error: 'Aksi tidak dikenali.' }, 400)

    const studentId = String(body.student_id ?? '')
    const attendanceDate = String(body.attendance_date ?? '')
    const checkInText = body.check_in ? String(body.check_in) : null
    const checkOutText = body.check_out ? String(body.check_out) : null
    const status = String(body.status ?? 'present')

    if (!studentId) return json({ ok: false, error: 'Murid wajib dipilih.' }, 400)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) return json({ ok: false, error: 'Tanggal absensi tidak valid.' }, 400)
    if (!allowedStatus.includes(status)) return json({ ok: false, error: 'Status absensi tidak valid.' }, 400)

    const { data: student } = await admin.from('students').select('id,full_name').eq('id', studentId).eq('is_active', true).maybeSingle()
    if (!student) return json({ ok: false, error: 'Murid tidak ditemukan atau tidak aktif.' }, 404)
    if (!(await teacherCanAccessStudent(studentId))) return json({ ok: false, error: 'Anda hanya dapat mengelola absensi kelas yang ditugaskan.' }, 403)

    const checkIn = toIso(attendanceDate, checkInText)
    const checkOut = toIso(attendanceDate, checkOutText)
    if (checkInText && !checkIn) return json({ ok: false, error: 'Jam masuk tidak valid.' }, 400)
    if (checkOutText && !checkOut) return json({ ok: false, error: 'Jam pulang tidak valid.' }, 400)
    if (checkOut && !checkIn) return json({ ok: false, error: 'Jam masuk wajib diisi jika jam pulang diisi.' }, 400)
    if (checkIn && checkOut && new Date(checkOut).getTime() < new Date(checkIn).getTime()) {
      return json({ ok: false, error: 'Jam pulang tidak boleh lebih awal dari jam masuk.' }, 400)
    }

    const payload = {
      student_id: studentId,
      attendance_date: attendanceDate,
      check_in: checkIn,
      check_out: checkOut,
      status,
      recorded_by: authData.user.id,
    }

    if (action === 'create') {
      const { data, error } = await admin.from('attendance_records').insert(payload).select('id').single()
      if (error) return json({ ok: false, error: error.code === '23505' ? 'Murid sudah memiliki data absensi pada tanggal tersebut.' : error.message }, 400)
      return json({ ok: true, record_id: data.id, student_name: student.full_name })
    }

    const recordId = String(body.record_id ?? '')
    if (!recordId) return json({ ok: false, error: 'Data absensi tidak valid.' }, 400)
    const { error } = await admin.from('attendance_records').update(payload).eq('id', recordId)
    if (error) return json({ ok: false, error: error.code === '23505' ? 'Murid sudah memiliki data absensi pada tanggal tersebut.' : error.message }, 400)
    return json({ ok: true, record_id: recordId, student_name: student.full_name })
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Terjadi kesalahan server.' }, 500)
  }
})
