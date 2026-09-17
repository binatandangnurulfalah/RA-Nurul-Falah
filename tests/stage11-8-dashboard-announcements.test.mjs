import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const dashboardPage = read('src/portal-v2/PortalPages.tsx')
const dashboardQuery = read('src/data/queries/dashboard.ts')
const announcementsPage = read('src/portal-v2/AnnouncementsPage.tsx')
const announcementsQuery = read('src/data/queries/announcements.ts')
const scanner = read('src/portal-v2/AttendanceScannerNative.tsx')

test('dashboard lifecycle memakai TanStack Query tanpa mengubah RPC summary', () => {
  assert.match(dashboardPage, /useQuery\(dashboardSummaryOptions\(role\)\)/)
  assert.match(dashboardPage, /useQuery\(parentTodayAttendanceOptions/)
  assert.match(dashboardQuery, /supabase\.rpc\('dashboard_summary'\)/)
  assert.match(dashboardQuery, /queryKeys\.dashboard\.meta\('summary'/)
  assert.match(dashboardQuery, /staleTime: 15_000/)
  assert.doesNotMatch(dashboardPage, /reloadToken/)
})

test('dashboard wali tetap membaca absensi anak terpilih melalui RLS-scoped Supabase query', () => {
  assert.match(dashboardQuery, /\.from\('attendance_records'\)/)
  assert.match(dashboardQuery, /\.eq\('student_id', childId\)/)
  assert.match(dashboardQuery, /\.eq\('attendance_date', attendanceDate\)/)
  assert.match(dashboardQuery, /enabled: role === 'parent' && Boolean\(childId\)/)
})

test('pengumuman memakai TanStack Query dan invalidasi dashboard setelah mutation', () => {
  assert.match(announcementsPage, /useQuery\(announcementsOptions/)
  assert.match(announcementsPage, /useQueryClient/)
  assert.match(announcementsQuery, /supabase[\s\S]*\.from\('announcements'\)/)
  assert.match(announcementsPage, /queryKeys\.announcements\.all/)
  assert.match(announcementsPage, /queryKeys\.dashboard\.all/)
  assert.match(announcementsPage, /ConfirmDialog/)
  assert.match(announcementsPage, /FormDialog/)
})

test('ownership Guru dan read tracking sementara tetap dipertahankan', () => {
  assert.match(announcementsPage, /row\.created_by === currentUserId/)
  assert.match(announcementsPage, /ra_read_announcements/)
  assert.match(announcementsPage, /ra-announcements-read/)
  assert.match(announcementsPage, /const busyRef = useRef\(false\)/)
  assert.match(announcementsPage, /const removingRef = useRef\(false\)/)
})

test('scanner tetap di luar scope query dashboard dan pengumuman', () => {
  assert.doesNotMatch(scanner, /dashboardSummaryOptions|announcementsOptions|queryKeys\.dashboard|queryKeys\.announcements/)
  assert.match(scanner, /navigator\.mediaDevices\.getUserMedia/)
  assert.doesNotMatch(scanner, /type="file"|\btorch\b|setManual|Masukkan kode QR secara manual/i)
})
