import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Supabase integration env is required')

const password = 'AmanSekali123'
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actors = {}
const fixture = {}

function dbFor(token) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function createActor(name, role) {
  const email = `${name}@stage11.test`
  assert.ifError((await service.from('account_allowlist').insert({ email, role, display_name: name })).error)
  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(createError)
  const { data: signed, error: signError } = await createClient(url, anonKey).auth.signInWithPassword({ email, password })
  assert.ifError(signError)
  assert.ok(signed.session)
  actors[name] = { id: created.user.id, token: signed.session.access_token, db: dbFor(signed.session.access_token) }
}

async function invoke(name, actor, body) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, payload: await response.json() }
}

before(async () => {
  for (const [name, role] of [['admin', 'admin'], ['teacherA', 'teacher'], ['teacherB', 'teacher'], ['parentA', 'parent'], ['parentB', 'parent']]) {
    await createActor(name, role)
  }

  const { data: classes, error: classError } = await service.from('school_classes').insert([
    { name: 'Kelas A', academic_year: '2026/2027', created_by: actors.admin.id },
    { name: 'Kelas B', academic_year: '2026/2027', created_by: actors.admin.id },
  ]).select('id,name')
  assert.ifError(classError)
  fixture.classA = classes.find((row) => row.name === 'Kelas A').id
  fixture.classB = classes.find((row) => row.name === 'Kelas B').id

  const { data: teachers, error: teacherError } = await service.from('teacher_profiles').insert([
    { full_name: 'Guru A', teacher_user_id: actors.teacherA.id },
    { full_name: 'Guru B', teacher_user_id: actors.teacherB.id },
  ]).select('id,teacher_user_id')
  assert.ifError(teacherError)
  fixture.teacherA = teachers.find((row) => row.teacher_user_id === actors.teacherA.id).id
  fixture.teacherB = teachers.find((row) => row.teacher_user_id === actors.teacherB.id).id
  assert.ifError((await service.from('teacher_class_assignments').insert([
    { class_id: fixture.classA, teacher_profile_id: fixture.teacherA },
    { class_id: fixture.classB, teacher_profile_id: fixture.teacherB },
  ])).error)

  const { data: students, error: studentError } = await service.from('students').insert([
    { full_name: 'Murid A', nis: 'ST11-A', class_name: 'Kelas A', created_by: actors.admin.id },
    { full_name: 'Murid B', nis: 'ST11-B', class_name: 'Kelas B', created_by: actors.admin.id },
  ]).select('id,full_name,qr_token')
  assert.ifError(studentError)
  const a = students.find((row) => row.full_name === 'Murid A')
  const b = students.find((row) => row.full_name === 'Murid B')
  Object.assign(fixture, { studentA: a.id, studentB: b.id, qrA: a.qr_token, qrB: b.id ? b.qr_token : null })
  assert.ifError((await service.from('student_guardians').insert([
    { student_id: a.id, guardian_user_id: actors.parentA.id, relationship: 'Ibu' },
    { student_id: b.id, guardian_user_id: actors.parentB.id, relationship: 'Ayah' },
  ])).error)

  const { data: attendance, error: attendanceError } = await service.from('attendance_records').insert([
    { student_id: a.id, attendance_date: '2026-09-01', status: 'present', source: 'manual', recorded_by: actors.teacherA.id },
    { student_id: b.id, attendance_date: '2026-09-01', status: 'present', source: 'manual', recorded_by: actors.teacherB.id },
  ]).select('id,student_id')
  assert.ifError(attendanceError)
  fixture.attendanceB = attendance.find((row) => row.student_id === b.id).id
})

test('RLS membatasi Guru dan Wali ke kelas atau anaknya', async () => {
  for (const [actor, expected] of [[actors.admin, ['Murid A', 'Murid B']], [actors.teacherA, ['Murid A']], [actors.teacherB, ['Murid B']], [actors.parentA, ['Murid A']], [actors.parentB, ['Murid B']]]) {
    const { data, error } = await actor.db.from('students').select('full_name').order('full_name')
    assert.ifError(error)
    assert.deepEqual(data.map((row) => row.full_name), expected)
  }
  const { data: hidden } = await actors.teacherA.db.from('attendance_records').select('id').eq('id', fixture.attendanceB)
  assert.equal(hidden.length, 0)
})

test('Auth tetap tertutup dan manajemen akun hanya untuk Admin', async () => {
  assert.ok((await createClient(url, anonKey).auth.signUp({ email: 'tanpa-izin@stage11.test', password })).error)
  assert.equal((await invoke('admin-create-user', actors.teacherA, { email: 'ditolak@stage11.test', display_name: 'Ditolak', role: 'parent' })).status, 403)

  const created = await invoke('admin-create-user', actors.admin, { email: 'dikelola@stage11.test', display_name: 'Akun Kelola', role: 'parent' })
  assert.equal(created.status, 201, JSON.stringify(created.payload))
  assert.equal('password' in created.payload, false)
  const userId = created.payload.user.id
  assert.equal((await invoke('admin-manage-user', actors.admin, { action: 'update', user_id: userId, display_name: 'Akun Diperbarui', role: 'parent', is_active: true })).status, 200)
  assert.equal((await invoke('admin-manage-user', actors.admin, { action: 'send_password_reset', user_id: userId })).status, 200)
  assert.equal((await invoke('admin-manage-user', actors.admin, { action: 'delete', user_id: userId })).status, 200)
})

test('attendance endpoint menolak kelas lain dan delete memakai endpoint utama', async () => {
  assert.equal((await invoke('record-attendance', actors.teacherA, { token: fixture.qrB })).status, 403)
  const ownScan = await invoke('record-attendance', actors.teacherA, { token: fixture.qrA })
  assert.equal(ownScan.status, 200, JSON.stringify(ownScan.payload))

  assert.equal((await invoke('manage-attendance-record', actors.teacherA, {
    action: 'update', record_id: fixture.attendanceB, student_id: fixture.studentA,
    attendance_date: '2026-09-02', status: 'present', check_in: '07:00', correction_reason: 'Uji lintas kelas',
  })).status, 403)
  assert.equal((await invoke('manage-attendance-record', actors.teacherA, {
    action: 'delete', record_id: fixture.attendanceB, correction_reason: 'Uji lintas kelas',
  })).status, 403)

  const own = await invoke('manage-attendance-record', actors.teacherA, {
    action: 'create', student_id: fixture.studentA, attendance_date: '2026-09-03', status: 'present', check_in: '07:00',
  })
  assert.equal(own.status, 200, JSON.stringify(own.payload))
  assert.equal((await invoke('manage-attendance-record', actors.teacherA, {
    action: 'delete', record_id: own.payload.record_id, correction_reason: 'Data pengujian',
  })).status, 200)
})

test('double checkout hanya memberi satu response sukses', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const { data: record, error } = await service.from('attendance_records').select('id').eq('student_id', fixture.studentA).eq('attendance_date', today).single()
  assert.ifError(error)
  assert.ifError((await service.from('attendance_records').update({ check_in: new Date(Date.now() - 180000).toISOString(), check_out: null, check_out_by: null }).eq('id', record.id)).error)

  const results = await Promise.all([
    invoke('record-attendance', actors.teacherA, { token: fixture.qrA }),
    invoke('record-attendance', actors.teacherA, { token: fixture.qrA }),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
  const { data: stored, error: storedError } = await service.from('attendance_records').select('check_out,check_out_by').eq('id', record.id).single()
  assert.ifError(storedError)
  assert.ok(stored.check_out)
  assert.equal(stored.check_out_by, actors.teacherA.id)
})

test('Storage private dan policy pembayaran/pengumuman tetap dipaksa', async () => {
  const path = 'stage11/dokumen-guru.pdf'
  const bytes = new TextEncoder().encode('%PDF-1.4 stage-11')
  assert.ifError((await actors.admin.db.storage.from('school-documents').upload(path, bytes, { contentType: 'application/pdf' })).error)
  assert.ok((await actors.teacherA.db.storage.from('school-documents').upload('stage11/ditolak.pdf', bytes, { contentType: 'application/pdf' })).error)
  assert.ifError((await actors.admin.db.from('school_documents').insert({ title: 'Dokumen Guru', category: 'Tes', file_url: path, audience: 'teacher', is_published: true, created_by: actors.admin.id })).error)
  assert.ifError((await actors.teacherA.db.storage.from('school-documents').download(path)).error)
  assert.ok((await actors.parentA.db.storage.from('school-documents').download(path)).error)

  const { data: announcement, error: announcementError } = await actors.admin.db.from('announcements').insert({ title: 'Pengumuman Admin', body: 'Tetap aman', audience: 'all', created_by: actors.admin.id }).select('id').single()
  assert.ifError(announcementError)
  const attempted = await actors.teacherA.db.from('announcements').update({ title: 'Diubah Guru' }).eq('id', announcement.id).select('id')
  assert.ifError(attempted.error)
  assert.equal(attempted.data.length, 0)
  assert.ok((await actors.admin.db.from('student_payments').insert({ student_id: fixture.studentA, payment_type: 'SPP', amount: 100000, paid_amount: 150000, status: 'paid', created_by: actors.admin.id })).error)
  assert.ifError((await actors.admin.db.storage.from('school-documents').remove([path])).error)
})
