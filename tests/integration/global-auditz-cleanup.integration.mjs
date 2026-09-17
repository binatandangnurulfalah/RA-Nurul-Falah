import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase integration env is required')

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const fixtureEmails = new Set(['auditAdmin@audit-stage11.test', 'auditTeacher@audit-stage11.test'])

test('fixture audit global dibersihkan sebelum security integration berikutnya', async () => {
  const { data: students, error: studentLookupError } = await service
    .from('students')
    .select('id')
    .eq('full_name', 'Murid Audit Aman Diperbarui')
  assert.ifError(studentLookupError)
  const studentIds = (students ?? []).map((row) => row.id)
  if (studentIds.length) assert.ifError((await service.from('students').delete().in('id', studentIds)).error)

  const { data: classes, error: classLookupError } = await service
    .from('school_classes')
    .select('id')
    .eq('name', 'Kelas Audit Global')
  assert.ifError(classLookupError)
  const classIds = (classes ?? []).map((row) => row.id)
  if (classIds.length) assert.ifError((await service.from('teacher_class_assignments').delete().in('class_id', classIds)).error)

  const { data: teachers, error: teacherLookupError } = await service
    .from('teacher_profiles')
    .select('id')
    .eq('full_name', 'Guru Audit Global')
  assert.ifError(teacherLookupError)
  const teacherIds = (teachers ?? []).map((row) => row.id)
  if (teacherIds.length) assert.ifError((await service.from('teacher_profiles').delete().in('id', teacherIds)).error)
  if (classIds.length) assert.ifError((await service.from('school_classes').delete().in('id', classIds)).error)

  const { data: listed, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assert.ifError(listError)
  for (const user of listed.users ?? []) {
    if (user.email && fixtureEmails.has(user.email)) {
      assert.ifError((await service.auth.admin.deleteUser(user.id)).error)
    }
  }
  assert.ifError((await service.from('account_allowlist').delete().in('email', [...fixtureEmails])).error)
})
