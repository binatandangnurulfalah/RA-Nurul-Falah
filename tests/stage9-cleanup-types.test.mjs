import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [portal, client, types, migration] = await Promise.all([
  read('../src/RolePortalV5.tsx'),
  read('../src/lib/supabase.ts'),
  read('../src/lib/database.types.ts'),
  read('../supabase/migrations/20260917085747_stage9_remove_duplicate_updated_at_trigger.sql'),
])

test('portal aktif memakai modul fitur terpisah tanpa barrel CRUD lama', () => {
  assert.doesNotMatch(portal, /CrudPages|RolePortalV4|SchoolModulesLegacy/)
  assert.match(portal, /portal-v2\/AccountsPage/)
  assert.match(portal, /portal-v2\/AnnouncementsPage/)
  assert.match(portal, /portal-v2\/ClassesPage/)
  assert.match(portal, /portal-v2\/SchedulePage/)
})

test('file dead code lama sudah dihapus', async () => {
  await assert.rejects(access(new URL('../src/RolePortalV4.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../src/portal-v2/CrudPages.tsx', import.meta.url)))
  await assert.rejects(access(new URL('../src/portal-v2/SchoolModulesLegacy.tsx', import.meta.url)))
})

test('Supabase client menggunakan types hasil generate dan environment variables', () => {
  assert.match(client, /createClient<Database>/)
  assert.match(client, /VITE_SUPABASE_URL/)
  assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(types, /export type Database =/)
  assert.match(types, /PostgrestVersion: "14\.5"/)
})

test('migration menyisakan satu trigger updated_at canonical', () => {
  assert.match(migration, /drop trigger if exists set_user_profiles_updated_at/)
  assert.match(migration, /create trigger user_profiles_touch_updated_at/)
  assert.match(migration, /drop function if exists public\.set_updated_at\(\)/)
})
