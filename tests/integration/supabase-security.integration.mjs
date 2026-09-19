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

async function setSingleTeacherClassMode(enabled) {
  const { data: settings, error: settingsError } = await service
    .from('school_settings')
    .select('school_name,address,phone,email,late_cutoff,academic_year_id')
    .eq('id', 1)
    .single()
  assert.ifError(settingsError)

  const result = await actors.admin.db.rpc('save_school_settings_with_policy', {
    p_school_name: settings.school_name,
    p_address: settings.address,
    p_phone: settings.phone,
    p_email: settings.email,
    p_late_cutoff: settings.late_cutoff,
    p_academic_year_id: settings.academic_year_id,
    p_single_teacher_class_mode: enabled,
  })
  assert.ifError(result.error)
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

  await setSingleTeacherClassMode(true)
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

test('saat mode 1 Guru = 1 Kelas OFF, Guru melihat dan mengelola seluruh murid', async () => {
  await setSingleTeacherClassMode(false)

  const { data: allStudents, error: allStudentsError } = await actors.teacherA.db
    .from('students')
    .select('id,full_name')
    .order('full_name')
  assert.ifError(allStudentsError)
  assert.deepEqual(allStudents.map((row) => row.full_name), ['Murid A', 'Murid B'])

  const { data: allClasses, error: allClassesError } = await actors.teacherA.db
    .from('school_classes')
    .select('id,name')
    .order('name')
  assert.ifError(allClassesError)
  assert.deepEqual(allClasses.map((row) => row.name), ['Kelas A', 'Kelas B'])

  const crossClassUpdate = await actors.teacherA.db.rpc('save_student_with_guardians', {
    p_student_id: fixture.studentB,
    p_full_name: 'Murid B Global',
    p_class_name: 'Kelas B',
    p_academic_year: fixture.academicYearLabelA,
    p_guardian_user_ids: [],
  })
  assert.ifError(crossClassUpdate.error)
  assert.equal(crossClassUpdate.data.full_name, 'Murid B Global')

  const unassignedCreate = await actors.teacherA.db.rpc('save_student_with_guardians', {
    p_full_name: 'Murid Tanpa Kelas',
    p_academic_year: fixture.academicYearLabelA,
    p_guardian_user_ids: [],
  })
  assert.ifError(unassignedCreate.error)
  assert.equal(unassignedCreate.data.class_id, null)

  assert.ifError((await service.from('students').update({ full_name: 'Murid B' }).eq('id', fixture.studentB)).error)
  assert.ifError((await service.from('students').delete().eq('id', unassignedCreate.data.id)).error)

  await setSingleTeacherClassMode(true)

  const { data: scopedAgain, error: scopedAgainError } = await actors.teacherA.db
    .from('students')
    .select('full_name')
    .order('full_name')
  assert.ifError(scopedAgainError)
  assert.deepEqual(scopedAgain.map((row) => row.full_name), ['Murid A'])
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

  const teacherOwnCreate = await actors.teacherA.db.rpc('save_student_with_guardians', {
    p_full_name: 'Murid Dibuat Guru',
    p_class_name: 'Kelas A',
    p_academic_year: fixture.academicYearLabelA,
    p_guardian_user_ids: [],
  })
  assert.ifError(teacherOwnCreate.error)
  assert.equal(teacherOwnCreate.data.class_id, fixture.classA)

  const teacherOwnUpdate = await actors.teacherA.db.rpc('save_student_with_guardians', {
    p_student_id: teacherOwnCreate.data.id,
    p_full_name: 'Murid Diperbarui Guru',
    p_class_name: 'Kelas A',
    p_academic_year: fixture.academicYearLabelA,
    p_guardian_user_ids: [],
  })
  assert.ifError(teacherOwnUpdate.error)
  assert.equal(teacherOwnUpdate.data.full_name, 'Murid Diperbarui Guru')

  const teacherCrossCreate = await actors.teacherA.db.rpc('save_student_with_guardians', {
    p_full_name: 'Murid Lintas Kelas Ditolak',
    p_class_name: 'Kelas B',
    p_academic_year: fixture.academicYearLabelA,
    p_guardian_user_ids: [],
  })
  assert.ok(teacherCrossCreate.error)
  assert.equal(teacherCrossCreate.error.code, '42501')

  assert.ifError((await actors.admin.db.from('students').delete().eq('id', teacherOwnCreate.data.id)).error)

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

test('mode 1 Guru = 1 Kelas menolak penugasan yang bertabrakan', async () => {
  const { data: settings, error: settingsError } = await actors.admin.db
    .from('school_settings')
    .select('school_name,address,phone,email,late_cutoff,academic_year_id,single_teacher_class_mode')
    .eq('id', 1)
    .single()
  assert.ifError(settingsError)

  const enableMode = await actors.admin.db.rpc('save_school_settings_with_policy', {
    p_school_name: settings.school_name,
    p_address: settings.address,
    p_phone: settings.phone,
    p_email: settings.email,
    p_late_cutoff: settings.late_cutoff,
    p_academic_year_id: settings.academic_year_id,
    p_single_teacher_class_mode: true,
  })
  assert.ifError(enableMode.error)

  const twoTeachersOneClass = await actors.admin.db.rpc('save_class_with_assignments', {
    p_class_id: fixture.classA,
    p_name: 'Kelas A',
    p_academic_year: fixture.academicYearLabelA,
    p_is_active: true,
    p_teacher_profile_ids: [fixture.teacherA, fixture.teacherB],
  })
  assert.ok(twoTeachersOneClass.error)
  assert.equal(twoTeachersOneClass.error.code, '23514')

  const oneTeacherTwoClasses = await actors.admin.db.rpc('save_class_with_assignments', {
    p_class_id: fixture.classB,
    p_name: 'Kelas B',
    p_academic_year: fixture.academicYearLabelA,
    p_is_active: true,
    p_teacher_profile_ids: [fixture.teacherA],
  })
  assert.ok(oneTeacherTwoClasses.error)
  assert.equal(oneTeacherTwoClasses.error.code, '23514')

  const keepModeEnabled = await actors.admin.db.rpc('save_school_settings_with_policy', {
    p_school_name: settings.school_name,
    p_address: settings.address,
    p_phone: settings.phone,
    p_email: settings.email,
    p_late_cutoff: settings.late_cutoff,
    p_academic_year_id: settings.academic_year_id,
    p_single_teacher_class_mode: true,
  })
  assert.ifError(keepModeEnabled.error)
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

test('foto profil private hanya dapat dikelola pemilik dan dibaca Admin', async () => {
  const ownerPath = `${actors.teacherA.id}/avatar`
  const otherPath = `${actors.teacherB.id}/avatar`
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  const ownUpload = await actors.teacherA.db.storage
    .from('profile-photos')
    .upload(ownerPath, bytes, { contentType: 'image/png', upsert: true })
  assert.ifError(ownUpload.error)

  const ownAvatarUpdate = await actors.teacherA.db.rpc('update_my_avatar', { p_avatar_path: ownerPath })
  assert.ifError(ownAvatarUpdate.error)
  assert.equal(ownAvatarUpdate.data.avatar_path, ownerPath)

  const crossUpload = await actors.teacherA.db.storage
    .from('profile-photos')
    .upload(otherPath, bytes, { contentType: 'image/png', upsert: true })
  assert.ok(crossUpload.error)

  const crossAvatarUpdate = await actors.teacherA.db.rpc('update_my_avatar', { p_avatar_path: otherPath })
  assert.ok(crossAvatarUpdate.error)
  assert.equal(crossAvatarUpdate.error.code, '22023')

  assert.ifError((await actors.teacherA.db.storage.from('profile-photos').download(ownerPath)).error)
  assert.ifError((await actors.admin.db.storage.from('profile-photos').download(ownerPath)).error)
  assert.ok((await actors.parentA.db.storage.from('profile-photos').download(ownerPath)).error)

  const clearAvatar = await actors.teacherA.db.rpc('update_my_avatar', { p_avatar_path: null })
  assert.ifError(clearAvatar.error)
  assert.equal(clearAvatar.data.avatar_path, null)

  assert.ifError((await actors.teacherA.db.storage.from('profile-photos').remove([ownerPath])).error)
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

test('parent family changes require teacher verification before canonical profile update', async () => {
  const bypass = await actors.parentA.db
    .from('user_profiles')
    .update({ display_name: 'Bypass Parent Ditolak' })
    .eq('id', actors.parentA.id)
    .select('id')
  assert.ok(bypass.error)
  assert.equal(bypass.error.code, '42501')

  const first = await actors.parentA.db.rpc('submit_parent_family_verification', {
    p_payload: {
      account_display_name: 'Wali Tahap 12.11',
      primary_phone: '081234567890',
      family_card_no: '3201010101010001',
      family_address: 'Alamat Keluarga Tahap 12.11',
      father_name: 'Ayah Tahap 12.11',
      mother_name: 'Ibu Tahap 12.11',
      emergency_contact_name: 'Kontak Darurat',
      emergency_contact_phone: '081200000001',
    },
  })
  assert.ifError(first.error)

  const { data: canonicalBefore, error: canonicalBeforeError } = await service
    .from('parent_family_profiles')
    .select('guardian_user_id')
    .eq('guardian_user_id', actors.parentA.id)
  assert.ifError(canonicalBeforeError)
  assert.equal(canonicalBefore.length, 0)

  const { data: hiddenFromOtherParent, error: hiddenError } = await actors.parentB.db
    .from('parent_verification_requests')
    .select('id')
    .eq('id', first.data)
  assert.ifError(hiddenError)
  assert.equal(hiddenFromOtherParent.length, 0)

  const { data: teacherVisible, error: teacherVisibleError } = await actors.teacherA.db
    .from('parent_verification_requests')
    .select('id,status')
    .eq('id', first.data)
    .single()
  assert.ifError(teacherVisibleError)
  assert.equal(teacherVisible.status, 'pending')

  const noReason = await actors.teacherA.db.rpc('review_parent_verification_request', {
    p_request_id: first.data,
    p_action: 'request_changes',
  })
  assert.ok(noReason.error)
  assert.equal(noReason.error.code, '22023')

  const requestChanges = await actors.teacherA.db.rpc('review_parent_verification_request', {
    p_request_id: first.data,
    p_action: 'request_changes',
    p_comment: 'Nomor telepon utama perlu diperiksa kembali.',
  })
  assert.ifError(requestChanges.error)

  const resubmit = await actors.parentA.db.rpc('submit_parent_family_verification', {
    p_supersedes_request_id: first.data,
    p_payload: {
      account_display_name: 'Wali Tahap 12.11 Terverifikasi',
      primary_phone: '081234567899',
      family_card_no: '3201010101010001',
      family_address: 'Alamat Keluarga Tahap 12.11',
      father_name: 'Ayah Tahap 12.11',
      mother_name: 'Ibu Tahap 12.11',
    },
  })
  assert.ifError(resubmit.error)

  const approve = await actors.teacherA.db.rpc('review_parent_verification_request', {
    p_request_id: resubmit.data,
    p_action: 'approve',
  })
  assert.ifError(approve.error)

  const { data: family, error: familyError } = await service
    .from('parent_family_profiles')
    .select('account_display_name,primary_phone,verified_by')
    .eq('guardian_user_id', actors.parentA.id)
    .single()
  assert.ifError(familyError)
  assert.equal(family.account_display_name, 'Wali Tahap 12.11 Terverifikasi')
  assert.equal(family.primary_phone, '081234567899')
  assert.equal(family.verified_by, actors.teacherA.id)

  const { data: profile, error: profileError } = await service
    .from('user_profiles')
    .select('display_name,phone,address')
    .eq('id', actors.parentA.id)
    .single()
  assert.ifError(profileError)
  assert.equal(profile.display_name, 'Wali Tahap 12.11 Terverifikasi')
  assert.equal(profile.phone, '081234567899')
  assert.equal(profile.address, 'Alamat Keluarga Tahap 12.11')
})

test('new child verification requires official student matching and preserves school-owned fields', async () => {
  const { data: candidate, error: candidateError } = await service.from('students').insert({
    full_name: 'Calon Anak Tahap 12.11',
    nis: 'ST1211-C',
    gender: 'P',
    birth_place: 'Sumedang',
    birth_date: '2021-04-05',
    class_id: fixture.classA,
    class_name: 'Kelas A',
    academic_year_id: fixture.academicYearA,
    academic_year: fixture.academicYearLabelA,
    created_by: actors.admin.id,
  }).select('id,nis,class_id,class_name').single()
  assert.ifError(candidateError)

  const submit = await actors.parentA.db.rpc('submit_parent_child_verification', {
    p_target_student_id: null,
    p_payload: {
      full_name: 'Calon Anak Tahap 12.11',
      nik: '3201010202020001',
      nisn: '0123456789',
      gender: 'P',
      birth_place: 'Sumedang',
      birth_date: '2021-04-05',
      relationship_to_child: 'Ayah',
    },
  })
  assert.ifError(submit.error)

  const wrongScope = await actors.teacherA.db.rpc('review_parent_verification_request', {
    p_request_id: submit.data,
    p_action: 'approve',
    p_matched_student_id: fixture.studentB,
  })
  assert.ok(wrongScope.error)
  assert.equal(wrongScope.error.code, '42501')

  const approveLink = await actors.teacherA.db.rpc('review_parent_verification_request', {
    p_request_id: submit.data,
    p_action: 'approve',
    p_matched_student_id: candidate.id,
  })
  assert.ifError(approveLink.error)

  const { data: link, error: linkError } = await service.from('student_guardians')
    .select('relationship')
    .eq('student_id', candidate.id)
    .eq('guardian_user_id', actors.parentA.id)
    .single()
  assert.ifError(linkError)
  assert.equal(link.relationship, 'Ayah')

  const updateRequest = await actors.parentA.db.rpc('submit_parent_child_verification', {
    p_target_student_id: candidate.id,
    p_payload: {
      full_name: 'Calon Anak Tahap 12.11 Diperbarui',
      nik: '3201010202020001',
      nisn: '0123456789',
      gender: 'P',
      birth_place: 'Darmaraja',
      birth_date: '2021-04-05',
      relationship_to_child: 'Ayah',
    },
  })
  assert.ifError(updateRequest.error)

  const { data: beforeApproval, error: beforeApprovalError } = await service.from('students')
    .select('full_name,birth_place,nis,class_id,class_name')
    .eq('id', candidate.id)
    .single()
  assert.ifError(beforeApprovalError)
  assert.equal(beforeApproval.full_name, 'Calon Anak Tahap 12.11')
  assert.equal(beforeApproval.birth_place, 'Sumedang')

  const approveUpdate = await actors.teacherA.db.rpc('review_parent_verification_request', {
    p_request_id: updateRequest.data,
    p_action: 'approve',
  })
  assert.ifError(approveUpdate.error)

  const { data: afterApproval, error: afterApprovalError } = await service.from('students')
    .select('full_name,birth_place,nis,class_id,class_name')
    .eq('id', candidate.id)
    .single()
  assert.ifError(afterApprovalError)
  assert.equal(afterApproval.full_name, 'Calon Anak Tahap 12.11 Diperbarui')
  assert.equal(afterApproval.birth_place, 'Darmaraja')
  assert.equal(afterApproval.nis, 'ST1211-C')
  assert.equal(afterApproval.class_id, fixture.classA)
  assert.equal(afterApproval.class_name, 'Kelas A')
})

