import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const attendance = read('src/portal-v2/AttendancePages.tsx')
const attendanceQuery = read('src/data/queries/attendance.ts')
const accounts = read('src/portal-v2/AccountsPage.tsx')
const accountsQuery = read('src/data/queries/accounts.ts')
const formDialog = read('src/components/forms/FormDialog.tsx')

test('attendance data page memakai reusable data UI tanpa mengubah backend contract', () => {
  for (const name of ['DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatCard', 'StatusBadge']) {
    assert.match(attendance, new RegExp(name))
  }
  assert.match(attendance, /FormDialog/)
  assert.match(attendanceQuery, /attendance_records_search/)
  assert.match(attendanceQuery, /attendance_summary_for_date/)
  assert.match(attendance, /manage-attendance-record/)
  assert.doesNotMatch(attendance, /SkeletonRows/)
  assert.doesNotMatch(attendance, /PageTitle/)
})

test('account management memakai reusable data UI dan mempertahankan edge function auth flow', () => {
  for (const name of ['DataTable', 'MobileDataCard', 'SearchFilterBar', 'StatCard', 'StatusBadge']) {
    assert.match(accounts, new RegExp(name))
  }
  assert.match(accounts, /ConfirmDialog/)
  assert.match(accounts, /FormDialog/)
  assert.match(accounts, /admin-create-user/)
  assert.match(accounts, /admin-manage-user/)
  assert.match(accountsQuery, /user_profiles/)
  assert.match(accountsQuery, /count: 'exact'/)
  assert.doesNotMatch(accounts, /SkeletonRows/)
  assert.doesNotMatch(accounts, /PageTitle/)
})

test('FormDialog mendukung danger action dan validation disable secara backward-compatible', () => {
  assert.match(formDialog, /submitVariant\?: ButtonVariant/)
  assert.match(formDialog, /submitDisabled\?: boolean/)
  assert.match(formDialog, /variant=\{submitVariant\}/)
  assert.match(formDialog, /disabled=\{busy \|\| submitDisabled\}/)
})

test('destructive attendance and account actions memiliki synchronous busy guard', () => {
  assert.match(attendance, /const removingRef = useRef\(false\)/)
  assert.match(accounts, /const removingRef = useRef\(false\)/)
  assert.match(attendance, /if \(!deleting \|\| !canManage \|\| removingRef\.current/)
  assert.match(accounts, /if \(!deleting \|\| removingRef\.current\) return/)
  assert.match(attendance, /removingRef\.current = true/)
  assert.match(accounts, /removingRef\.current = true/)
  assert.match(attendance, /busy=\{removing\}/)
  assert.match(accounts, /busy=\{removing\}/)
})
