import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Supabase integration env is required')

const password = 'AuditAman123!'
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
  const email = `${name}@audit-stage11.test`
  assert.ifError((await service.from('account_allowlist').insert({ email, role, display_name: name })).error)
  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(createError)
  const { data: signed, error: signError } = await createClient(url, anonKey).auth.signInWithPassword({ email, password })
  assert.ifError(signError)
  assert.ok(signed.session)
  actors[name] = { id: created.user.id, db: dbFor(signed.session.access_token) }
}

before(async () => {
  await createActor('auditAdmin', 'admin')
  await createActor('auditTeacher', 'teacher')

  const [{ data: year, error: yearError }, { data: settings, error: settingsError }] = await Promise.all([
    actors.auditAdmin.db
      .from('academic_years')
      .select('id,label')
      .eq('is_current', true)
      .single(),
    actors.auditAdmin.db
      .from('school_settings')
      .select('school_name,address,phone,email,late_cutoff,academic_year_id')
      .eq('id', 1)
      .single(),
  ])
  assert.ifError(yearError)
  assert.ifError(settingsError)
  fixture.yearId = year.id
  fixture.yearLabel = year.label
  fixture.settings = settings
})

test('audit global menyimpan UUID, integer, dan composite record key dengan actor yang benar', async () => {
  const { data: schoolClass, error: classError } = await actors.auditAdmin.db
    .from('school_classes')
    .insert({
      name: 'Kelas Audit Global',
      academic_year_id: fixture.yearId,
      academic_year: fixture.yearLabel,
      created_by: actors.auditAdmin.id,
    })
    .select('id')
    .single()
  assert.ifError(classError)

  const { data: teacher, error: teacherError } = await actors.auditAdmin.db
    .from('teacher_profiles')
    .insert({ full_name: 'Guru Audit Global' })
    .select('id')
    .single()
  assert.ifError(teacherError)

  assert.ifError((await actors.auditAdmin.db.from('teacher_class_assignments').insert({
    class_id: schoolClass.id,
    teacher_profile_id: teacher.id,
  })).error)

  assert.ifError((await actors.auditAdmin.db.rpc('save_school_settings', {
    p_school_name: fixture.settings.school_name,
    p_address: fixture.settings.address,
    p_phone: fixture.settings.phone,
    p_email: fixture.settings.email,
    p_late_cutoff: '07:16:00',
    p_academic_year_id: fixture.settings.academic_year_id,
  })).error)

  const { data: rows, error } = await actors.auditAdmin.db
    .from('audit_events_view')
    .select('table_name,record_id,record_key,actor_user_id,action')
    .in('table_name', ['school_classes', 'teacher_class_assignments', 'school_settings'])
    .order('changed_at', { ascending: false })
  assert.ifError(error)

  const classEvent = rows.find((row) => row.table_name === 'school_classes' && row.record_key === schoolClass.id)
  assert.ok(classEvent)
  assert.equal(classEvent.record_id, schoolClass.id)
  assert.equal(classEvent.actor_user_id, actors.auditAdmin.id)

  const assignmentKey = `${schoolClass.id}:${teacher.id}`
  const assignmentEvent = rows.find((row) => row.table_name === 'teacher_class_assignments' && row.record_key === assignmentKey)
  assert.ok(assignmentEvent)
  assert.equal(assignmentEvent.record_id, null)
  assert.equal(assignmentEvent.actor_user_id, actors.auditAdmin.id)

  const settingsEvent = rows.find((row) => row.table_name === 'school_settings' && row.record_key === '1')
  assert.ok(settingsEvent)
  assert.equal(settingsEvent.record_id, null)
  assert.equal(settingsEvent.actor_user_id, actors.auditAdmin.id)
})

test('audit payload menyimpan changed fields tetapi membuang nilai sensitif', async () => {
  const { data: student, error: insertError } = await actors.auditAdmin.db
    .from('students')
    .insert({
      full_name: 'Murid Audit Aman',
      nik: '3201010101010101',
      academic_year_id: fixture.yearId,
      academic_year: fixture.yearLabel,
      created_by: actors.auditAdmin.id,
    })
    .select('id')
    .single()
  assert.ifError(insertError)

  assert.ifError((await actors.auditAdmin.db.from('students').update({
    full_name: 'Murid Audit Aman Diperbarui',
    nik: '3202020202020202',
  }).eq('id', student.id)).error)

  const { data: event, error } = await actors.auditAdmin.db
    .from('audit_events_view')
    .select('old_data,new_data,changed_fields,actor_user_id')
    .eq('table_name', 'students')
    .eq('record_key', student.id)
    .eq('action', 'UPDATE')
    .order('changed_at', { ascending: false })
    .limit(1)
    .single()
  assert.ifError(error)
  assert.equal(event.actor_user_id, actors.auditAdmin.id)
  assert.ok(event.changed_fields.includes('full_name'))
  assert.ok(event.changed_fields.includes('nik'))
  assert.equal(Object.hasOwn(event.old_data, 'nik'), false)
  assert.equal(Object.hasOwn(event.new_data, 'nik'), false)
  assert.equal(Object.hasOwn(event.new_data, 'qr_token'), false)
  assert.equal(event.new_data.full_name, 'Murid Audit Aman Diperbarui')
})

test('audit view hanya terbaca Admin dan explicit account event tidak menyimpan rahasia', async () => {
  const { error: appendError } = await actors.auditAdmin.db.rpc('append_account_audit_event', {
    p_target_user_id: actors.auditTeacher.id,
    p_event_name: 'PASSWORD_RESET_REQUESTED',
    p_details: { delivery: 'email' },
  })
  assert.ifError(appendError)

  const { data: adminRows, error: adminError } = await actors.auditAdmin.db
    .from('audit_events_view')
    .select('event_name,new_data,actor_user_id')
    .eq('table_name', 'account_management')
    .eq('record_key', actors.auditTeacher.id)
  assert.ifError(adminError)
  assert.equal(adminRows.length, 1)
  assert.equal(adminRows[0].event_name, 'PASSWORD_RESET_REQUESTED')
  assert.equal(adminRows[0].actor_user_id, actors.auditAdmin.id)
  assert.deepEqual(adminRows[0].new_data, { delivery: 'email' })

  const { data: teacherRows, error: teacherError } = await actors.auditTeacher.db
    .from('audit_events_view')
    .select('id')
  assert.ifError(teacherError)
  assert.equal(teacherRows.length, 0)
})
