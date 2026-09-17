import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Supabase integration env is required')

const password = 'AmanSekali123'
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actors = {}
const fixture = {}
const fixtureEmails = ['dashboard-admin@stage11.test', 'dashboard-teacher@stage11.test', 'dashboard-parent@stage11.test']
const fixtureClassNames = ['Dashboard RPC A', 'Dashboard RPC B']
const fixtureAnnouncementTitles = ['Info Semua Dashboard', 'Info Guru Dashboard']

function dbFor(token) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function createActor(name, role) {
  const email = `dashboard-${name}@stage11.test`
  assert.ifError((await service.from('account_allowlist').insert({ email, role, display_name: `Dashboard ${name}` })).error)
  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(createError)
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signed, error: signError } = await authClient.auth.signInWithPassword({ email, password })
  assert.ifError(signError)
  assert.ok(signed.session)
  actors[name] = { id: created.user.id, db: dbFor(signed.session.access_token) }
}

before(async () => {
  await createActor('admin', 'admin')
  await createActor('teacher', 'teacher')
  await createActor('parent', 'parent')

  const { data: classes, error: classError } = await service.from('school_classes').insert([
    { name: 'Dashboard RPC A', academic_year: '2026/2027', created_by: actors.admin.id },
    { name: 'Dashboard RPC B', academic_year: '2026/2027', created_by: actors.admin.id },
  ]).select('id,name')
  assert.ifError(classError)
  fixture.classA = classes.find((row) => row.name === 'Dashboard RPC A').id
  fixture.classB = classes.find((row) => row.name === 'Dashboard RPC B').id

  const { data: teacher, error: teacherError } = await service.from('teacher_profiles').insert({
    full_name: 'Guru Dashboard RPC', teacher_user_id: actors.teacher.id,
  }).select('id').single()
  assert.ifError(teacherError)
  fixture.teacherProfile = teacher.id
  assert.ifError((await service.from('teacher_class_assignments').insert({ class_id: fixture.classA, teacher_profile_id: teacher.id })).error)

  const { data: students, error: studentError } = await service.from('students').insert([
    { full_name: 'Dashboard Murid A', nis: 'DBRPC-A', class_name: 'Dashboard RPC A', academic_year: '2026/2027', created_by: actors.admin.id },
    { full_name: 'Dashboard Murid B', nis: 'DBRPC-B', class_name: 'Dashboard RPC B', academic_year: '2026/2027', created_by: actors.admin.id },
  ]).select('id,full_name')
  assert.ifError(studentError)
  fixture.studentA = students.find((row) => row.full_name === 'Dashboard Murid A').id
  fixture.studentB = students.find((row) => row.full_name === 'Dashboard Murid B').id

  assert.ifError((await service.from('student_guardians').insert({
    student_id: fixture.studentA, guardian_user_id: actors.parent.id, relationship: 'Ibu',
  })).error)

  const jakartaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(new Date())
  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  const dayOfWeek = dayMap[weekday]

  assert.ifError((await service.from('attendance_records').insert([
    { student_id: fixture.studentA, attendance_date: jakartaDate, status: 'present', source: 'manual', check_in: new Date().toISOString(), recorded_by: actors.teacher.id },
    { student_id: fixture.studentB, attendance_date: jakartaDate, status: 'late', source: 'manual', check_in: new Date().toISOString(), recorded_by: actors.admin.id },
  ])).error)

  assert.ifError((await service.from('report_cards').insert([
    { student_id: fixture.studentA, academic_year: '2026/2027', semester: 1, is_published: false, created_by: actors.teacher.id },
    { student_id: fixture.studentB, academic_year: '2026/2027', semester: 1, is_published: false, created_by: actors.admin.id },
  ])).error)

  assert.ifError((await service.from('student_payments').insert([
    { student_id: fixture.studentA, payment_type: 'SPP', amount: 100000, paid_amount: 0, status: 'unpaid', created_by: actors.admin.id },
    { student_id: fixture.studentB, payment_type: 'SPP', amount: 100000, paid_amount: 50000, status: 'partial', created_by: actors.admin.id },
  ])).error)

  assert.ifError((await service.from('school_schedules').insert([
    { class_name: 'Dashboard RPC A', day_of_week: dayOfWeek, start_time: '07:30', end_time: '08:00', activity: 'Pembukaan A', academic_year: '2026/2027', created_by: actors.admin.id },
    { class_name: 'Dashboard RPC B', day_of_week: dayOfWeek, start_time: '08:00', end_time: '08:30', activity: 'Pembukaan B', academic_year: '2026/2027', created_by: actors.admin.id },
  ])).error)

  assert.ifError((await service.from('announcements').insert([
    { title: 'Info Semua Dashboard', body: 'Informasi umum', audience: 'all', is_published: true, created_by: actors.admin.id },
    { title: 'Info Guru Dashboard', body: 'Informasi guru', audience: 'teacher', is_published: true, created_by: actors.admin.id },
  ])).error)
})

after(async () => {
  const studentIds = [fixture.studentA, fixture.studentB].filter(Boolean)
  const classIds = [fixture.classA, fixture.classB].filter(Boolean)

  if (studentIds.length) {
    assert.ifError((await service.from('attendance_records').delete().in('student_id', studentIds)).error)
    assert.ifError((await service.from('report_cards').delete().in('student_id', studentIds)).error)
    assert.ifError((await service.from('student_payments').delete().in('student_id', studentIds)).error)
    assert.ifError((await service.from('student_guardians').delete().in('student_id', studentIds)).error)
    assert.ifError((await service.from('students').delete().in('id', studentIds)).error)
  }

  if (classIds.length) assert.ifError((await service.from('teacher_class_assignments').delete().in('class_id', classIds)).error)
  if (fixture.teacherProfile) assert.ifError((await service.from('teacher_profiles').delete().eq('id', fixture.teacherProfile)).error)
  assert.ifError((await service.from('school_schedules').delete().in('class_name', fixtureClassNames)).error)
  assert.ifError((await service.from('announcements').delete().in('title', fixtureAnnouncementTitles)).error)
  assert.ifError((await service.from('school_classes').delete().in('name', fixtureClassNames)).error)

  for (const actor of Object.values(actors)) {
    if (actor?.id) assert.ifError((await service.auth.admin.deleteUser(actor.id)).error)
  }
  assert.ifError((await service.from('account_allowlist').delete().in('email', fixtureEmails)).error)
})

async function summaryFor(actor) {
  const { data, error } = await actor.db.rpc('dashboard_summary')
  assert.ifError(error)
  assert.ok(data)
  return data
}

test('dashboard_summary membatasi Guru ke kelas yang ditugaskan', async () => {
  const summary = await summaryFor(actors.teacher)
  assert.equal(summary.role, 'teacher')
  assert.equal(summary.active_students, 1)
  assert.equal(summary.attendance_today, 1)
  assert.equal(summary.late_today, 0)
  assert.equal(summary.absent_today, 0)
  assert.equal(summary.unrecorded_today, 0)
  assert.equal(summary.draft_reports, 1)
  assert.equal(summary.open_payments, 0)
  assert.equal(summary.today_schedule_count, 1)
  assert.deepEqual(summary.recent_attendance.map((row) => row.student_name), ['Dashboard Murid A'])
  assert.ok(summary.recent_announcements.some((row) => row.title === 'Info Semua Dashboard'))
  assert.ok(summary.recent_announcements.some((row) => row.title === 'Info Guru Dashboard'))
})

test('dashboard_summary membatasi Wali ke anak terhubung dan tidak membuka draft rapor', async () => {
  const summary = await summaryFor(actors.parent)
  assert.equal(summary.role, 'parent')
  assert.equal(summary.active_students, 1)
  assert.equal(summary.attendance_today, 1)
  assert.equal(summary.unrecorded_today, 0)
  assert.equal(summary.draft_reports, 0)
  assert.equal(summary.open_payments, 1)
  assert.equal(summary.today_schedule_count, 1)
  assert.deepEqual(summary.recent_attendance, [])
  assert.ok(summary.recent_announcements.some((row) => row.title === 'Info Semua Dashboard'))
  assert.equal(summary.recent_announcements.some((row) => row.title === 'Info Guru Dashboard'), false)
})

test('dashboard_summary Admin mendapat ringkasan sekolah tanpa mengubah data', async () => {
  const summary = await summaryFor(actors.admin)
  assert.equal(summary.role, 'admin')
  assert.ok(summary.active_students >= 2)
  assert.ok(summary.attendance_today >= 2)
  assert.ok(summary.active_accounts >= 3)
  assert.ok(summary.open_payments >= 2)
  assert.ok(summary.today_schedule_count >= 2)
})
