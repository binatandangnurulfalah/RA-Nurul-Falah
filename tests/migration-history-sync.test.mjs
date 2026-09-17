import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const manifest = JSON.parse(await readFile(new URL('../supabase/production-migration-manifest.json', import.meta.url), 'utf8'))

const migrationDir = new URL('../supabase/migrations/', import.meta.url)
const bootstrapDir = new URL('../supabase/bootstrap/', import.meta.url)

const migrationFiles = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort()
const bootstrapFiles = (await readdir(bootstrapDir)).filter((name) => name.endsWith('.sql')).sort()

const expectedMigrations = [...manifest.production_migrations].sort()
const expectedBootstrap = [...manifest.bootstrap_untracked].sort()

test('folder migration identik dengan manifest migration produksi', () => {
  assert.deepEqual(migrationFiles, expectedMigrations)
})

test('DDL historis di luar migration history tetap tersimpan sebagai bootstrap', () => {
  assert.deepEqual(bootstrapFiles, expectedBootstrap)
})

test('migration produksi menggunakan timestamp unik dan berurutan', () => {
  const versions = manifest.production_migrations.map((name) => name.slice(0, 14))
  assert.equal(new Set(versions).size, versions.length)
  assert.deepEqual(versions, [...versions].sort())
})
