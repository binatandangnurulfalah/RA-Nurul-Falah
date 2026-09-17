import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey || !serviceKey) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required')
}

const password = 'AmanSekali123'
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actors = {}
const fixture = {}

function client(token) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function createActor(name, role) {
  const email = `${name}@stage10.test`
  const { error: allowError } = await service.from('account_allowlist').insert({
    email, role, display_name: name, is_active: true,
  })
  assert.ifError(allowError)
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  assert.ifError(createError)
  const { data: signed, error: signError } = await createClient(url, anonKey).auth.signInWithPassword({ email, password })
  assert.ifError(signError)
  actors[name] = { id: created.user.id, email, token: signed.session.access_token, db: client(signed.session.access_token) }
}

async function invoke(name, actor, body) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${actor.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  return { status: response.status, payload }
}

before(async () => {
  for (const [name, role] of [
    ['admin', 'admin'], ['teacherA', 'teacher'], ['teacherB', 'teacher'],
    ['parentA', 'parent'], ['parentB', 'parent'],
  ]) await createActor(name, role)

  const { data: classes, error: classError } = await service.from('school_classes').insert([
    { name: 'Kelas A', academic_year: '2026/2027', created_by: actors.admin.id },
    { name: 'Kelas B', academic_year: '2026/2027', created_by: actors.admin.id },
  ]).select('id,name')
  assert.ifError(classError)
  fixture.classA = classes.find((item) => item.name === 'Kelas A').id
  fixture.classB = classes.find((item) => item.name === 'Kelas B').id

  const { data: teachers, error: teacherError } = await service.from('teacher_profiles').insert([
    { full_name: 'Guru A', teacher_user_id: actors.teacherA.id },
    { full_name: 'Guru B', teacher_user_id: actors.teacherB.id },
  ]).select('id,teacher_user_id')
  assert.ifError(teacherError)
  fixture.teacherA = teachers.find((item) => item.teacher_user_id === actors.teacherA.id).id
  fixture.teacherB = teachers.find((item) => item.teacher_user_id === actors.teacherB.id).id
  assert.ifError((await service.from('teacher_class_assignments').insert([
    { class_id: fixture.classA, teacher_profile_id: fixture.teacherA },
    { class_id: fixture.classB, teacher_profile_id: fixture.teacherB },
  ])).error)

  const { data: students, error: studentError } = await service.from('students').insert([
    { full_name: 'Murid A', nis: 'ST10-A', class_name: 'Kelas A', created_by: actors.admin.id },
    { full_name: 'Murid B', nis: 'ST10-B', class_name: 'Kelas B', created_by: actors.admin.id },
  ]).select('id,full_name,qr_token')
  assert.ifError(studentError)
  const studentA = students.find((item) => item.full_name === 'Murid A')
  const studentB = students.find((item) => item.full_name === 'Murid B')
  Object.assign(fixture, { studentA: studentA.id, studentB: studentB.id, qrA: studentA.qr_token, qrB: studentB.qr_token })
  assert.ifError((await service.from('student_guardians').insert([
    { student_id: fixture.studentA, guardian_user_id: actors.parentA.id, relationship: 'Ibu' },
    { student_id: fixture.studentB, guardian_user_id: actors.parentB.id, relationship: 'Ayah' },
  ])).error)

  const { data: attendance, error: attendanceError } = await service.from('attendance_records').insert([
    { student_id: fixture.studentA, attendance_date: '2026-09-01', status: 'present', recorded_by: actors.teacherA.id },
    { student_id: fixture.studentB, attendance_date: '2026-09-01', status: 'present', recorded_by: actors.teacherB.id },
  ]).select('id,student_id')
  assert.ifError(attendanceError)
  fixture.attendanceA = attendance.find((item) => item.student_id === fixture.studentA).id
  fixture.attendanceB = attendance.find((item) => item.student_id === fixture.studentB).id
})

test('RLS membatasi Guru dan Wali ke kelas atau anaknya', async () => {
  const expectations = [
    [actors.admin, ['Murid A', 'Murid B']],
    [actors.teacherA, ['Murid A']], [actors.teacherB, ['Murid B']],
    [actors.parentA, ['Murid A']], [actors.parentB, ['Murid B']],
  ]
  for (const [actor, names] of expectations) {
    const { data, error } = await actor.db.from('students').select('full_name').order('full_name')
    assert.ifError(error)
    assert.deepEqual(data.map((row) => row.full_name), names)
  }
  const { data: hidden } = await actors.teacherA.db.from('attendance_records').select('id').eq('id', fixture.attendanceB)
  assert.equal(hidden.length, 0)
  const { error: forbiddenWrite } = await actors.teacherA.db.from('students').update({ full_name: 'Tidak Boleh' }).eq('id', fixture.studentB)
  assert.ifError(forbiddenWrite)
  const { data: unchanged } = await service.from('students').select('full_name').eq('id', fixture.studentB).single()
  assert.equal(unchanged.full_name, 'Murid B')
})

test('Auth menolak signup publik dan Edge Function akun hanya menerima Admin', async () => {
  const { error: signupError } = await createClient(url, anonKey).auth.signUp({
    email: 'tanpa-izin@stage10.test', password,
  })
  assert.ok(signupError)

  const denied = await invoke('admin-create-user', actors.teacherA, {
    email: 'ditolak@stage10.test', password, display_name: 'Ditolak', role: 'parent',
  })
  assert.equal(denied.status, 403)

  const created = await invoke('admin-create-user', actors.admin, {
    email: 'dikelola@stage10.test', password, display_name: 'Akun Kelola', role: 'parent',
  })
  assert.equal(created.status, 201, JSON.stringify(created.payload))
  const managedId = created.payload.user.id
  assert.equal((await invoke('admin-manage-user', actors.teacherA, { action: 'delete', user_id: managedId })).status, 403)
  assert.equal((await invoke('admin-manage-user', actors.admin, {
    action: 'update', user_id: managedId, display_name: 'Akun Diperbarui', role: 'parent', is_active: true,
  })).status, 200)
  assert.equal((await invoke('admin-manage-user', actors.admin, { action: 'delete', user_id: managedId })).status, 200)
})

test('semua Edge Function absensi menolak akses lintas kelas', async () => {
  const crossScan = await invoke('record-attendance', actors.teacherA, { token: fixture.qrB })
  assert.equal(crossScan.status, 403)
  const ownScan = await invoke('record-attendance', actors.teacherA, { token: fixture.qrA })
  assert.equal(ownScan.status, 200, JSON.stringify(ownScan.payload))

  const crossUpdate = await invoke('manage-attendance-record', actors.teacherA, {
    action: 'update', record_id: fixture.attendanceB, student_id: fixture.studentA,
    attendance_date: '2026-09-02', status: 'present', check_in: '07:00', check_out: null,
  })
  assert.equal(crossUpdate.status, 403)
  assert.equal((await invoke('manage-attendance-record', actors.teacherA, {
    action: 'delete', record_id: fixture.attendanceB,
  })).status, 403)
  assert.equal((await invoke('delete-attendance-record', actors.teacherA, {
    record_id: fixture.attendanceB,
  })).status, 403)

  const ownCreate = await invoke('manage-attendance-record', actors.teacherA, {
    action: 'create', student_id: fixture.studentA, attendance_date: '2026-09-03',
    status: 'present', check_in: '07:00', check_out: null,
  })
  assert.equal(ownCreate.status, 200, JSON.stringify(ownCreate.payload))
  assert.equal((await invoke('delete-attendance-record', actors.teacherA, {
    record_id: ownCreate.payload.record_id,
  })).status, 200)
  const { data: protectedRecord } = await service.from('attendance_records').select('id').eq('id', fixture.attendanceB).single()
  assert.equal(protectedRecord.id, fixture.attendanceB)
})

test('Storage private: Admin menulis, audience yang tepat membaca', async () => {
  const path = 'stage10/dokumen-guru.pdf'
  const bytes = new TextEncoder().encode('%PDF-1.4 stage-10')
  const uploaded = await actors.admin.db.storage.from('school-documents').upload(path, bytes, { contentType: 'application/pdf' })
  assert.ifError(uploaded.error)
  assert.ok((await actors.teacherA.db.storage.from('school-documents').upload('stage10/ditolak.pdf', bytes, { contentType: 'application/pdf' })).error)

  assert.ifError((await actors.admin.db.from('school_documents').insert({
    title: 'Dokumen Guru', category: 'Tes', file_url: path, audience: 'teacher',
    is_published: true, created_by: actors.admin.id,
  })).error)
  assert.ifError((await actors.teacherA.db.storage.from('school-documents').download(path)).error)
  assert.ok((await actors.parentA.db.storage.from('school-documents').download(path)).error)
  assert.ifError((await actors.admin.db.storage.from('school-documents').remove([path])).error)
})

test('policy pengumuman dan constraint pembayaran tetap dipaksa database', async () => {
  const { data: announcement, error } = await actors.admin.db.from('announcements').insert({
    title: 'Pengumuman Admin', body: 'Tidak boleh diubah guru', audience: 'all', created_by: actors.admin.id,
  }).select('id').single()
  assert.ifError(error)
  const attempted = await actors.teacherA.db.from('announcements').update({ title: 'Diubah Guru' }).eq('id', announcement.id).select('id')
  assert.ifError(attempted.error)
  assert.equal(attempted.data.length, 0)

  const invalidPayment = await actors.admin.db.from('student_payments').insert({
    student_id: fixture.studentA, payment_type: 'SPP', amount: 100000, paid_amount: 150000,
    status: 'paid', created_by: actors.admin.id,
  })
  assert.ok(invalidPayment.error)
})
