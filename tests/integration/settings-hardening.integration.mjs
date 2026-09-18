import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Supabase integration env is required')

const password = 'SettingsHardening123!'
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actors = {}
const fixture = {}
const emails = {
  admin: 'settingsAdmin@stage1116.test',
  teacher: 'settingsTeacher@stage1116.test',
}

function dbFor(token) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signInWithRetry(email, retryPassword, attempts = 6) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    try {
      const result = await client.auth.signInWithPassword({ email, password: retryPassword })
      if (!result.error && result.data.session) return result
      lastError = result.error
      if (result.error && !/fetch failed|network|connect|socket/i.test(result.error.message || '')) return result
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
  }
  return { data: { session: null }, error: lastError ?? new Error('Auth login did not become ready') }
}

async function createActor(name, role, email) {
  assert.ifError((await service.from('account_allowlist').insert({
    email,
    role,
    display_name: `Stage 11.16 ${name}`,
  })).error)
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  assert.ifError(createError)
  const { data: signed, error: signError } = await signInWithRetry(email, password)
  assert.ifError(signError)
  assert.ok(signed.session)
  actors[name] = { id: created.user.id, db: dbFor(signed.session.access_token) }
}

before(async () => {
  await createActor('admin', 'admin', emails.admin)
  await createActor('teacher', 'teacher', emails.teacher)

  const [{ data: settings, error: settingsError }, { data: currentYear, error: yearError }] = await Promise.all([
    service.from('school_settings').select('*').eq('id', 1).single(),
    service.from('academic_years').select('id,label').eq('is_current', true).single(),
  ])
  assert.ifError(settingsError)
  assert.ifError(yearError)
  fixture.originalSettings = settings
  fixture.currentYear = currentYear

  const { data: inactiveYear, error: inactiveError } = await service
    .from('academic_years')
    .insert({
      label: '2098/2099',
      start_date: '2098-07-01',
      end_date: '2099-06-30',
      is_current: false,
      is_active: false,
    })
    .select('id')
    .single()
  assert.ifError(inactiveError)
  fixture.inactiveYearId = inactiveYear.id
})

after(async () => {
  if (fixture.originalSettings) {
    assert.ifError((await service.from('school_settings').update({
      school_name: fixture.originalSettings.school_name,
      address: fixture.originalSettings.address,
      phone: fixture.originalSettings.phone,
      email: fixture.originalSettings.email,
      timezone: fixture.originalSettings.timezone,
      late_cutoff: fixture.originalSettings.late_cutoff,
      academic_year_id: fixture.originalSettings.academic_year_id,
      updated_by: fixture.originalSettings.updated_by,
    }).eq('id', 1)).error)
  }

  if (fixture.inactiveYearId) {
    assert.ifError((await service.from('academic_years').delete().eq('id', fixture.inactiveYearId)).error)
  }

  for (const actor of Object.values(actors)) {
    if (actor?.id) assert.ifError((await service.auth.admin.deleteUser(actor.id)).error)
  }
  assert.ifError((await service.from('account_allowlist').delete().in('email', Object.values(emails))).error)
})

test('Admin menyimpan settings melalui RPC canonical dan academic year mirror tetap sinkron', async () => {
  const { error } = await actors.admin.db.rpc('save_school_settings', {
    p_school_name: fixture.originalSettings.school_name,
    p_address: fixture.originalSettings.address,
    p_phone: fixture.originalSettings.phone,
    p_email: fixture.originalSettings.email,
    p_late_cutoff: '07:17:00',
    p_academic_year_id: fixture.currentYear.id,
  })
  assert.ifError(error)

  const { data: row, error: rowError } = await service
    .from('school_settings')
    .select('timezone,late_cutoff,academic_year,academic_year_id,updated_by')
    .eq('id', 1)
    .single()
  assert.ifError(rowError)
  assert.equal(row.timezone, 'Asia/Jakarta')
  assert.equal(row.academic_year_id, fixture.currentYear.id)
  assert.equal(row.academic_year, fixture.currentYear.label)
  assert.equal(row.updated_by, actors.admin.id)
  assert.match(row.late_cutoff, /^07:17/)
})

test('direct table UPDATE ditolak walaupun actor adalah Admin', async () => {
  const direct = await actors.admin.db
    .from('school_settings')
    .update({ late_cutoff: '07:18:00' })
    .eq('id', 1)
  assert.ok(direct.error)
})

test('Guru dan anon tidak dapat menjalankan settings RPC', async () => {
  const args = {
    p_school_name: fixture.originalSettings.school_name,
    p_address: fixture.originalSettings.address,
    p_phone: fixture.originalSettings.phone,
    p_email: fixture.originalSettings.email,
    p_late_cutoff: '07:18:00',
    p_academic_year_id: fixture.currentYear.id,
  }
  assert.ok((await actors.teacher.db.rpc('save_school_settings', args)).error)

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  assert.ok((await anon.rpc('save_school_settings', args)).error)
})

test('tahun ajaran nonaktif ditolak oleh backend', async () => {
  const result = await actors.admin.db.rpc('save_school_settings', {
    p_school_name: fixture.originalSettings.school_name,
    p_address: fixture.originalSettings.address,
    p_phone: fixture.originalSettings.phone,
    p_email: fixture.originalSettings.email,
    p_late_cutoff: '07:18:00',
    p_academic_year_id: fixture.inactiveYearId,
  })
  assert.ok(result.error)
  assert.match(result.error.message, /Tahun ajaran harus berasal dari daftar tahun ajaran aktif/)
})
