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
  ]).select('id,name,academic_year_id,academic_year')
  assert.ifError(classError)
  const classA = classes.find((row) => row.name === 'Kelas A')
  const classB = classes.find((row) => row.name === 'Kelas B')
  fixture.classA = classA.id
  fixture.classB = classB.id
  fixture.academicYearA = classA.academic_year_id
  fixture.academicYearLabelA = classA.academic_year

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

test('master data murid, relasi wali, dan jadwal hanya dapat ditulis Admin', async () => {
  const teacherInsert = await actors.teacherA.db.from('students').insert({
    full_name: 'Murid Ditolak Guru',
    class_id: fixture.classA,
    class_name: 'Kelas A',
    academic_year_id: fixture.academicYearA,
    academic_year: fixture.academicYearLabelA,
    created_by: actors.teacherA.id,
  })
  assert.ok(teacherInsert.error)

  const teacherUpdate = await actors.teacherA.db.from('students')
    .update({ full_name: 'Murid A Diubah Guru' })
    .eq('id', fixture.studentA)
    .select('id')
  assert.ifError(teacherUpdate.error)
  assert.equal(teacherUpdate.data.length, 0)
  const { data: unchangedStudent, error: unchangedStudentError } = await service.from('students').select('full_name').eq('id', fixture.studentA).single()
  assert.ifError(unchangedStudentError)
  assert.equal(unchangedStudent.full_name, 'Murid A')

  const teacherRpc = await actors.teacherA.db.rpc('save_student_with_guardians', {
    p_student_id: fixture.studentA,
    p_full_name: 'Murid A',
    p_class_name: 'Kelas A',
    p_academic_year: fixture.academicYearLabelA,
    p_guardian_user_ids: [actors.parentA.id],
  })
  assert.ok(teacherRpc.error)
  assert.match(teacherRpc.error.message, /Hanya Admin/)

  const guardianInsert = await actors.teacherA.db.from('student_guardians').insert({
    student_id: fixture.studentA,
    guardian_user_id: actors.parentB.id,
    relationship: 'Wali',
  })
  assert.ok(guardianInsert.error)

  const guardianDelete = await actors.teacherA.db.from('student_guardians')
    .delete()
    .eq('student_id', fixture.studentA)
    .eq('guardian_user_id', actors.parentA.id)
    .select('student_id')
  assert.ifError(guardianDelete.error)
  assert.equal(guardianDelete.data.length, 0)

  const { data: schedule, error: scheduleError } = await actors.admin.db.from('school_schedules').insert({
    class_id: fixture.classA,
    class_name: 'Kelas A',
    academic_year_id: fixture.academicYearA,
    academic_year: fixture.academicYearLabelA,
    day_of_week: 1,
    start_time: '08:00',
    end_time: '08:30',
    activity: 'Kegiatan Tahap 12.5',
    teacher_name: 'Guru A',
    created_by: actors.admin.id,
  }).select('id').single()
  assert.ifError(scheduleError)

  const teacherScheduleInsert = await actors.teacherA.db.from('school_schedules').insert({
    class_id: fixture.classA,
    class_name: 'Kelas A',
    academic_year_id: fixture.academicYearA,
    academic_year: fixture.academicYearLabelA,
    day_of_week: 2,
    start_time: '08:00',
    end_time: '08:30',
    activity: 'Jadwal Ditolak',
    created_by: actors.teacherA.id,
  })
  assert.ok(teacherScheduleInsert.error)

  const teacherScheduleUpdate = await actors.teacherA.db.from('school_schedules')
    .update({ activity: 'Diubah Guru' })
    .eq('id', schedule.id)
    .select('id')
  assert.ifError(teacherScheduleUpdate.error)
  assert.equal(teacherScheduleUpdate.data.length, 0)

  const teacherScheduleDelete = await actors.teacherA.db.from('school_schedules')
    .delete()
    .eq('id', schedule.id)
    .select('id')
  assert.ifError(teacherScheduleDelete.error)
  assert.equal(teacherScheduleDelete.data.length, 0)

  assert.ifError((await actors.admin.db.from('school_schedules').delete().eq('id', schedule.id)).error)
})

test('Auth tetap tertutup dan manajemen akun hanya untuk Admin', async () => {
  assert.ok((await createClient(url, anonKey).auth.signUp({ email: 'tanpa-izin@stage11.test', password })).error)
  assert.equal((await invoke('admin-create-user', actors.teacherA, { email: 'ditolak@stage11.test', display_name: 'Ditolak', role: 'parent' })).status, 403)

  const created = await invoke('admin-create-user', actors.admin, { email: 'dikelola@stage11.test', display_name: 'Akun Kelola', role: 'parent' })
  assert.equal(created.status, 201, JSON.stringify(created.payload))
  assert.equal('password' in created.payload, false)
  const userId = created.payload.user.id
  assert.equal((await invoke('admin-manage-user', actors.admin, { action: 'update', user_id: userId, display_name: 'Akun Diperbarui', role: 'parent', is_active: false })).status, 200)
  const { data: bannedUser, error: bannedUserError } = await service.auth.admin.getUserById(userId)
  assert.ifError(bannedUserError)
  assert.ok(bannedUser.user.banned_until && new Date(bannedUser.user.banned_until).getTime() > Date.now())

  assert.equal((await invoke('admin-manage-user', actors.admin, { action: 'update', user_id: userId, display_name: 'Akun Diperbarui', role: 'parent', is_active: true })).status, 200)
  const { data: activeUser, error: activeUserError } = await service.auth.admin.getUserById(userId)
  assert.ifError(activeUserError)
  assert.ok(!activeUser.user.banned_until || new Date(activeUser.user.banned_until).getTime() <= Date.now())

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

test('Storage private, metadata canonical, dan cleanup backend dipaksa', async () => {
  const path = 'stage12/dokumen-guru.pdf'
  const orphanPath = 'stage12/orphan.pdf'
  const bytes = new TextEncoder().encode('%PDF-1.4 stage-12')

  assert.ifError((await actors.admin.db.storage.from('school-documents').upload(path, bytes, { contentType: 'application/pdf' })).error)
  assert.ok((await actors.teacherA.db.storage.from('school-documents').upload('stage12/ditolak.pdf', bytes, { contentType: 'application/pdf' })).error)

  const { data: document, error: documentError } = await actors.admin.db.from('school_documents').insert({
    title: 'Dokumen Guru',
    category: 'Tes',
    storage_path: path,
    original_file_name: 'dokumen-guru.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: bytes.byteLength,
    audience: 'teacher',
    is_published: true,
    created_by: actors.admin.id,
  }).select('id,file_url,storage_path,external_url,original_file_name,mime_type,file_size_bytes').single()
  assert.ifError(documentError)
  assert.equal(document.storage_path, path)
  assert.equal(document.file_url, path)
  assert.equal(document.external_url, null)
  assert.equal(document.original_file_name, 'dokumen-guru.pdf')
  assert.equal(document.mime_type, 'application/pdf')
  assert.equal(document.file_size_bytes, bytes.byteLength)

  assert.ifError((await actors.teacherA.db.storage.from('school-documents').download(path)).error)
  assert.ok((await actors.parentA.db.storage.from('school-documents').download(path)).error)
  assert.ifError((await service.storage.from('school-documents').download(path)).error)

  const teacherCleanup = await invoke('process-document-storage-cleanup', actors.teacherA, {})
  assert.equal(teacherCleanup.status, 403)

  assert.ifError((await actors.admin.db.from('school_documents').delete().eq('id', document.id)).error)
  const directQueueRead = await actors.admin.db.from('school_document_storage_cleanup').select('id')
  assert.ok(directQueueRead.error, 'queue cleanup tidak boleh dibaca/diubah langsung oleh client')

  const cleanup = await invoke('process-document-storage-cleanup', actors.admin, {})
  assert.equal(cleanup.status, 200, JSON.stringify(cleanup.payload))
  assert.equal(cleanup.payload.ok, true)
  assert.ok(cleanup.payload.processed >= 1)
  assert.ok((await service.storage.from('school-documents').download(path)).error)

  assert.ifError((await actors.admin.db.storage.from('school-documents').upload(orphanPath, bytes, { contentType: 'application/pdf' })).error)
  assert.ok((await actors.teacherA.db.rpc('enqueue_school_document_storage_cleanup', { p_object_path: orphanPath })).error)
  assert.ifError((await actors.admin.db.rpc('enqueue_school_document_storage_cleanup', { p_object_path: orphanPath })).error)
  const orphanCleanup = await invoke('process-document-storage-cleanup', actors.admin, {})
  assert.equal(orphanCleanup.status, 200, JSON.stringify(orphanCleanup.payload))
  assert.ok((await service.storage.from('school-documents').download(orphanPath)).error)

  assert.ok((await actors.admin.db.from('school_documents').insert({
    title: 'Sumber Ganda Ditolak',
    storage_path: 'stage12/ganda.pdf',
    external_url: 'https://example.com/ganda.pdf',
    audience: 'admin',
    created_by: actors.admin.id,
  })).error)

  assert.ok((await actors.admin.db.from('school_documents').insert({
    title: 'Metadata Ukuran Ditolak',
    storage_path: 'stage12/besar.pdf',
    file_size_bytes: (10 * 1024 * 1024) + 1,
    audience: 'admin',
    created_by: actors.admin.id,
  })).error)

  const { data: announcement, error: announcementError } = await actors.admin.db.from('announcements').insert({ title: 'Pengumuman Admin', body: 'Tetap aman', audience: 'all', created_by: actors.admin.id }).select('id').single()
  assert.ifError(announcementError)
  const attempted = await actors.teacherA.db.from('announcements').update({ title: 'Diubah Guru' }).eq('id', announcement.id).select('id')
  assert.ifError(attempted.error)
  assert.equal(attempted.data.length, 0)
  assert.ok((await actors.admin.db.from('student_payments').insert({ student_id: fixture.studentA, payment_type: 'SPP', amount: 100000, paid_amount: 150000, status: 'paid', created_by: actors.admin.id })).error)
})
