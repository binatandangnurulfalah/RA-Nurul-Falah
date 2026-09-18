import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonKey || !serviceKey) throw new Error('Supabase integration env is required')

const password = 'PaymentModel123!'
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actors = {}
const fixture = {}
const emails = {
  admin: 'paymentAdmin@stage1114.test',
  parent: 'paymentParent@stage1114.test',
  teacher: 'paymentTeacher@stage1114.test',
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
  assert.ifError((await service.from('account_allowlist').insert({ email, role, display_name: `Stage 11.14 ${name}` })).error)
  const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  assert.ifError(createError)
  const { data: signed, error: signError } = await signInWithRetry(email, password)
  assert.ifError(signError)
  assert.ok(signed.session)
  actors[name] = { id: created.user.id, db: dbFor(signed.session.access_token) }
}

before(async () => {
  await createActor('admin', 'admin', emails.admin)
  await createActor('parent', 'parent', emails.parent)
  await createActor('teacher', 'teacher', emails.teacher)

  const { data: schoolClass, error: classError } = await service
    .from('school_classes')
    .insert({ name: 'Kelas Payment 11.14', academic_year: '2026/2027', created_by: actors.admin.id })
    .select('id')
    .single()
  assert.ifError(classError)
  fixture.classId = schoolClass.id

  const { data: student, error: studentError } = await service
    .from('students')
    .insert({
      full_name: 'Murid Payment 11.14',
      nis: 'PAY-1114',
      class_name: 'Kelas Payment 11.14',
      created_by: actors.admin.id,
    })
    .select('id')
    .single()
  assert.ifError(studentError)
  fixture.studentId = student.id

  assert.ifError((await service.from('student_guardians').insert({
    student_id: student.id,
    guardian_user_id: actors.parent.id,
    relationship: 'Wali',
  })).error)
})

after(async () => {
  if (fixture.studentId) {
    const { data: charges } = await service.from('student_payments').select('id').eq('student_id', fixture.studentId)
    const chargeIds = (charges ?? []).map((row) => row.id)
    if (chargeIds.length) assert.ifError((await service.from('payment_transactions').delete().in('payment_id', chargeIds)).error)
    if (chargeIds.length) assert.ifError((await service.from('student_payments').delete().in('id', chargeIds)).error)
    assert.ifError((await service.from('student_guardians').delete().eq('student_id', fixture.studentId)).error)
    assert.ifError((await service.from('students').delete().eq('id', fixture.studentId)).error)
  }
  if (fixture.classId) assert.ifError((await service.from('school_classes').delete().eq('id', fixture.classId)).error)

  for (const actor of Object.values(actors)) {
    if (actor?.id) assert.ifError((await service.auth.admin.deleteUser(actor.id)).error)
  }
  assert.ifError((await service.from('account_allowlist').delete().in('email', Object.values(emails))).error)
})

test('tagihan hanya dapat dimutasi melalui RPC Admin', async () => {
  const direct = await actors.admin.db.from('student_payments').insert({
    student_id: fixture.studentId,
    payment_type: 'Ditolak Langsung',
    amount: 100000,
  })
  assert.ok(direct.error)

  assert.ok((await actors.teacher.db.rpc('save_student_charge', {
    p_payment_id: null,
    p_student_id: fixture.studentId,
    p_payment_type: 'SPP',
    p_period_label: 'September 2026',
    p_amount: 100000,
    p_due_date: '2026-09-30',
    p_is_waived: false,
    p_notes: null,
  })).error)

  const { data: chargeId, error } = await actors.admin.db.rpc('save_student_charge', {
    p_payment_id: null,
    p_student_id: fixture.studentId,
    p_payment_type: 'SPP',
    p_period_label: 'September 2026',
    p_amount: 100000,
    p_due_date: '2026-09-30',
    p_is_waived: false,
    p_notes: 'Tagihan pengujian',
  })
  assert.ifError(error)
  fixture.chargeId = chargeId

  const { data: parentRows, error: parentError } = await actors.parent.db.from('student_payments').select('id').eq('id', chargeId)
  assert.ifError(parentError)
  assert.equal(parentRows.length, 1)

  const { data: teacherRows, error: teacherError } = await actors.teacher.db.from('student_payments').select('id').eq('id', chargeId)
  assert.ifError(teacherError)
  assert.equal(teacherRows.length, 0)
})

test('transaksi menghitung agregat backend dan overpayment ditolak', async () => {
  const first = await actors.admin.db.rpc('record_payment_transaction', {
    p_payment_id: fixture.chargeId,
    p_amount: 40000,
    p_paid_at: '2026-09-18T08:00:00+07:00',
    p_method: 'cash',
    p_reference_no: null,
    p_notes: 'Pembayaran pertama',
  })
  assert.ifError(first.error)
  fixture.firstTransaction = first.data

  const { data: partial, error: partialError } = await service
    .from('student_payments')
    .select('paid_amount,status,paid_at')
    .eq('id', fixture.chargeId)
    .single()
  assert.ifError(partialError)
  assert.equal(Number(partial.paid_amount), 40000)
  assert.equal(partial.status, 'partial')
  assert.ok(partial.paid_at)

  const overpay = await actors.admin.db.rpc('record_payment_transaction', {
    p_payment_id: fixture.chargeId,
    p_amount: 70000,
    p_paid_at: '2026-09-18T09:00:00+07:00',
    p_method: 'bank_transfer',
    p_reference_no: 'OVERPAY',
    p_notes: null,
  })
  assert.ok(overpay.error)

  const second = await actors.admin.db.rpc('record_payment_transaction', {
    p_payment_id: fixture.chargeId,
    p_amount: 60000,
    p_paid_at: '2026-09-18T09:00:00+07:00',
    p_method: 'bank_transfer',
    p_reference_no: 'TRX-1114',
    p_notes: null,
  })
  assert.ifError(second.error)
  fixture.secondTransaction = second.data

  const { data: paid, error: paidError } = await service
    .from('student_payments')
    .select('paid_amount,status')
    .eq('id', fixture.chargeId)
    .single()
  assert.ifError(paidError)
  assert.equal(Number(paid.paid_amount), 100000)
  assert.equal(paid.status, 'paid')
})

test('Wali melihat histori anak, Guru tidak, dan direct transaction mutation ditolak', async () => {
  const { data: parentRows, error: parentError } = await actors.parent.db
    .from('payment_transactions')
    .select('id')
    .eq('payment_id', fixture.chargeId)
  assert.ifError(parentError)
  assert.equal(parentRows.length, 2)

  const { data: teacherRows, error: teacherError } = await actors.teacher.db
    .from('payment_transactions')
    .select('id')
    .eq('payment_id', fixture.chargeId)
  assert.ifError(teacherError)
  assert.equal(teacherRows.length, 0)

  assert.ok((await actors.admin.db.from('payment_transactions').insert({
    payment_id: fixture.chargeId,
    amount: 1,
    method: 'cash',
  })).error)
})

test('pembatalan transaksi mempertahankan histori dan memperbarui saldo', async () => {
  const voided = await actors.admin.db.rpc('void_payment_transaction', {
    p_transaction_id: fixture.secondTransaction,
    p_reason: 'Salah nominal transfer',
  })
  assert.ifError(voided.error)

  const { data: charge, error: chargeError } = await service
    .from('student_payments')
    .select('paid_amount,status')
    .eq('id', fixture.chargeId)
    .single()
  assert.ifError(chargeError)
  assert.equal(Number(charge.paid_amount), 40000)
  assert.equal(charge.status, 'partial')

  const { data: transaction, error: transactionError } = await service
    .from('payment_transactions')
    .select('voided_at,voided_by,void_reason')
    .eq('id', fixture.secondTransaction)
    .single()
  assert.ifError(transactionError)
  assert.ok(transaction.voided_at)
  assert.equal(transaction.voided_by, actors.admin.id)
  assert.equal(transaction.void_reason, 'Salah nominal transfer')

  assert.ok((await actors.admin.db.rpc('delete_student_charge', { p_payment_id: fixture.chargeId })).error)
})

test('tagihan waived menolak transaksi dan audit mencatat payment_transactions', async () => {
  const { data: waivedId, error } = await actors.admin.db.rpc('save_student_charge', {
    p_payment_id: null,
    p_student_id: fixture.studentId,
    p_payment_type: 'Kegiatan',
    p_period_label: null,
    p_amount: 50000,
    p_due_date: null,
    p_is_waived: true,
    p_notes: null,
  })
  assert.ifError(error)
  fixture.waivedId = waivedId

  assert.ok((await actors.admin.db.rpc('record_payment_transaction', {
    p_payment_id: waivedId,
    p_amount: 10000,
    p_paid_at: '2026-09-18T10:00:00+07:00',
    p_method: 'cash',
    p_reference_no: null,
    p_notes: null,
  })).error)

  const { data: audits, error: auditError } = await service
    .from('audit_events')
    .select('table_name,record_key')
    .eq('table_name', 'payment_transactions')
  assert.ifError(auditError)
  assert.ok(audits.length >= 3)
})
