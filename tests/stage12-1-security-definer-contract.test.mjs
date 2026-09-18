import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const sources = {
  append_account_audit_event: read('supabase/migrations/20260917183405_stage11_11_global_audit_events.sql'),
  enqueue_school_document_storage_cleanup: read('supabase/migrations/20260918021105_stage11_12_storage_document_architecture.sql'),
  announcement_unread_count: read('supabase/migrations/20260918023205_stage11_13_announcement_reads_realtime.sql'),
  mark_announcements_read: read('supabase/migrations/20260918023205_stage11_13_announcement_reads_realtime.sql'),
  save_student_charge: read('supabase/migrations/20260918025037_stage11_14_payment_data_model.sql'),
  record_payment_transaction: read('supabase/migrations/20260918025037_stage11_14_payment_data_model.sql'),
  void_payment_transaction: read('supabase/migrations/20260918025037_stage11_14_payment_data_model.sql'),
  delete_student_charge: read('supabase/migrations/20260918025037_stage11_14_payment_data_model.sql'),
  save_school_settings: read('supabase/migrations/20260918034538_stage11_16_settings_hardening.sql'),
}

function functionWindow(source, name) {
  const marker = `create or replace function public.${name}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${name}: function definition missing`)
  const nextFunction = source.indexOf('create or replace function ', start + marker.length)
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction)
}

const adminOnly = [
  'append_account_audit_event',
  'enqueue_school_document_storage_cleanup',
  'save_student_charge',
  'record_payment_transaction',
  'void_payment_transaction',
  'delete_student_charge',
  'save_school_settings',
]

const userScoped = [
  'announcement_unread_count',
  'mark_announcements_read',
]

test('advisor-facing SECURITY DEFINER RPCs keep a locked search_path and explicit ACLs', () => {
  for (const [name, source] of Object.entries(sources)) {
    const block = functionWindow(source, name)
    assert.match(block, /\bsecurity definer\b/i, `${name}: must remain SECURITY DEFINER`)
    assert.match(block, /set search_path\s*=\s*''/i, `${name}: must keep empty search_path`)
    assert.match(block, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\b[\\s\\S]*?from\\s+public\\s*,\\s*anon`, 'i'), `${name}: public/anon EXECUTE must stay revoked`)
    assert.match(block, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\b[\\s\\S]*?to\\s+authenticated`, 'i'), `${name}: authenticated EXECUTE must remain explicit`)
  }
})

test('admin-only SECURITY DEFINER RPCs keep both authenticated identity and admin-role guards', () => {
  for (const name of adminOnly) {
    const block = functionWindow(sources[name], name)
    assert.match(block, /auth\.uid\(\)/, `${name}: must bind authorization to the JWT user`)
    assert.match(block, /private\.current_user_role\(\)/, `${name}: must check the application role`)
    assert.match(block, /'admin'::public\.app_role/, `${name}: must remain Admin-only`)
    assert.match(block, /errcode\s*=\s*'42501'/, `${name}: authorization rejection must remain explicit`)
  }
})

test('user-scoped announcement RPCs keep identity, role, and bounded visibility guards', () => {
  for (const name of userScoped) {
    const block = functionWindow(sources[name], name)
    assert.match(block, /auth\.uid\(\)/, `${name}: must require an authenticated user`)
    assert.match(block, /private\.current_user_role\(\)/, `${name}: must resolve the caller role`)
    assert.match(block, /announcement_targeted_to_role/, `${name}: must preserve audience filtering`)
    assert.match(block, /errcode\s*=\s*'42501'/, `${name}: invalid sessions must stay rejected`)
  }

  const markRead = functionWindow(sources.mark_announcements_read, 'mark_announcements_read')
  assert.match(markRead, /v_count\s*>\s*200/, 'mark_announcements_read: batch size guard must remain bounded')
})
