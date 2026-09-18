import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Supabase integration env is required')

const password = 'AnnouncementRead123!'
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actors = {}
const fixture = {}
const fixtureEmails = [
  'announcementAdmin@stage1113.test',
  'announcementTeacher@stage1113.test',
  'announcementParent@stage1113.test',
]

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
  assert.ifError((await service.from('account_allowlist').insert({ email, role, display_name: name })).error)
  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(createError)
  const { data: signed, error: signError } = await signInWithRetry(email, password)
  assert.ifError(signError)
  assert.ok(signed.session)
  actors[name] = { id: created.user.id, db: dbFor(signed.session.access_token) }
}

async function unread(actor) {
  const { data, error } = await actor.db.rpc('announcement_unread_count')
  assert.ifError(error)
  return Number(data ?? 0)
}

before(async () => {
  await createActor('admin', 'admin', fixtureEmails[0])
  await createActor('teacher', 'teacher', fixtureEmails[1])
  await createActor('parent', 'parent', fixtureEmails[2])

  const { data, error } = await actors.admin.db.from('announcements').insert([
    { title: 'Stage 11.13 Semua', body: 'Untuk semua', audience: 'all', is_published: true, created_by: actors.admin.id },
    { title: 'Stage 11.13 Guru', body: 'Untuk guru', audience: 'teacher', is_published: true, created_by: actors.admin.id },
    { title: 'Stage 11.13 Wali', body: 'Untuk wali', audience: 'parent', is_published: true, created_by: actors.admin.id },
    { title: 'Stage 11.13 Draft', body: 'Belum terbit', audience: 'all', is_published: false, created_by: actors.admin.id },
  ]).select('id,title')
  assert.ifError(error)
  for (const row of data) fixture[row.title] = row.id
})

after(async () => {
  const ids = Object.entries(fixture)
    .filter(([key]) => key.startsWith('Stage 11.13'))
    .map(([, value]) => value)
  if (ids.length) assert.ifError((await service.from('announcements').delete().in('id', ids)).error)

  for (const actor of Object.values(actors)) {
    if (actor?.id) assert.ifError((await service.auth.admin.deleteUser(actor.id)).error)
  }
  assert.ifError((await service.from('account_allowlist').delete().in('email', fixtureEmails)).error)
})

test('unread count mengikuti audience dan publication state per role', async () => {
  assert.equal(await unread(actors.admin), 3)
  assert.equal(await unread(actors.teacher), 2)
  assert.equal(await unread(actors.parent), 2)
})

test('mark read hanya menerima pengumuman yang benar-benar ditujukan ke user', async () => {
  const { data, error } = await actors.teacher.db.rpc('mark_announcements_read', {
    p_announcement_ids: [
      fixture['Stage 11.13 Semua'],
      fixture['Stage 11.13 Guru'],
      fixture['Stage 11.13 Wali'],
      fixture['Stage 11.13 Draft'],
    ],
  })
  assert.ifError(error)
  assert.equal(Number(data), 2)
  assert.equal(await unread(actors.teacher), 0)

  const directRead = await actors.teacher.db.from('announcement_reads').select('announcement_id')
  assert.ok(directRead.error, 'read-state table tidak boleh dibaca langsung oleh client')
})

test('pengumuman yang diperbarui menjadi unread lagi setelah sebelumnya dibaca', async () => {
  assert.ifError((await actors.parent.db.rpc('mark_announcements_read', {
    p_announcement_ids: [fixture['Stage 11.13 Semua'], fixture['Stage 11.13 Wali']],
  })).error)
  assert.equal(await unread(actors.parent), 0)

  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ifError((await actors.admin.db.from('announcements').update({
    body: 'Untuk semua - diperbarui',
  }).eq('id', fixture['Stage 11.13 Semua'])).error)

  assert.equal(await unread(actors.parent), 1)
})

test('anon tidak dapat menggunakan RPC read tracking', async () => {
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  assert.ok((await anon.rpc('announcement_unread_count')).error)
  assert.ok((await anon.rpc('mark_announcements_read', { p_announcement_ids: [fixture['Stage 11.13 Semua']] })).error)
})
