import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../supabase/migrations/20260917125645_stage11_dashboard_summary.sql', import.meta.url), 'utf8')
const rpcNormalization = await readFile(new URL('../supabase/migrations/20260917130537_normalize_optional_rpc_ids.sql', import.meta.url), 'utf8')
const dashboard = await readFile(new URL('../src/portal-v2/PortalPages.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/dashboard-v11.css', import.meta.url), 'utf8')
const types = await readFile(new URL('../src/lib/database.types.ts', import.meta.url), 'utf8')

test('dashboard_summary mempertahankan RLS dengan security invoker', () => {
  assert.match(migration, /security invoker/i)
  assert.doesNotMatch(migration, /security definer/i)
  assert.match(migration, /revoke all on function public\.dashboard_summary\(\) from public/i)
  assert.match(migration, /revoke all on function public\.dashboard_summary\(\) from anon/i)
  assert.match(migration, /grant execute on function public\.dashboard_summary\(\) to authenticated/i)
})

test('dashboard summary memakai zona waktu sekolah dan query role-scoped', () => {
  assert.match(migration, /Asia\/Jakarta/)
  assert.match(migration, /from public\.students s/)
  assert.match(migration, /from public\.attendance_records ar/)
  assert.match(migration, /from public\.report_cards rc/)
  assert.match(migration, /from public\.school_schedules ss/)
  assert.match(migration, /from public\.announcements a/)
  assert.match(migration, /if v_role = 'admin'/i)
  assert.match(migration, /if v_role in \('admin'.*'parent'/is)
})

test('dashboard frontend memakai satu rpc summary bukan query count terpisah', () => {
  assert.match(dashboard, /supabase\.rpc\('dashboard_summary'\)/)
  assert.doesNotMatch(dashboard, /select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(dashboard, /Murid Dalam Scope/)
  assert.match(dashboard, /Tagihan Aktif/)
  assert.match(dashboard, /JADWAL HARI INI/)
  assert.match(dashboard, /ABSENSI TERBARU/)
  assert.match(dashboard, /PENGUMUMAN TERBARU/)
})

test('generated types mengenali dashboard_summary dan metadata audit absensi', () => {
  assert.match(types, /dashboard_summary: \{ Args: never; Returns: Json \}/)
  assert.match(types, /check_in_by: string \| null/)
  assert.match(types, /check_out_by: string \| null/)
  assert.match(types, /correction_reason: string \| null/)
  assert.match(types, /last_corrected_by: string \| null/)
})

test('create-edit RPC memakai id opsional sesuai semantik database', () => {
  assert.match(rpcNormalization, /p_class_id uuid default null/i)
  assert.match(rpcNormalization, /p_student_id uuid default null/i)
  assert.match(types, /p_class_id\?: string/)
  assert.match(types, /p_student_id\?: string/)
})

test('dashboard layout tetap responsive dan ramah sentuh', () => {
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 900px\)/)
  assert.match(styles, /min-height: 44px/)
})
