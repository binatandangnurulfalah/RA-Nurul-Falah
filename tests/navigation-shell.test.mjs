import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const shell = await readFile(new URL('../src/RolePortalV5.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/navigation-shell.css', import.meta.url), 'utf8')
const focusHook = await readFile(new URL('../src/components/ui/useDialogFocus.ts', import.meta.url), 'utf8')

test('sidebar desktop dikelompokkan sesuai domain utama aplikasi', () => {
  assert.match(shell, /label: 'Ringkasan', ids: \['dashboard'\]/)
  assert.match(shell, /label: 'Akademik', ids: \['students', 'teachers', 'classes', 'schedule', 'reports'\]/)
  assert.match(shell, /label: 'Kehadiran', ids: \['attendance', 'attendance-data'\]/)
  assert.match(shell, /label: 'Administrasi', ids: \['payments', 'documents', 'announcements'\]/)
  assert.match(shell, /label: 'Sistem', ids: \['accounts', 'audit', 'settings'\]/)
})

test('profil hanya menjadi tujuan route dan dibuka dari avatar topbar', () => {
  assert.match(shell, /item\.id !== 'profile'/)
  assert.match(shell, /onClick=\{\(\) => go\('profile'\)\}/)
  assert.match(shell, /aria-label="Buka profil"/)
  assert.doesNotMatch(shell, /label: 'Sistem', ids: \[[^\]]*'profile'/)
  assert.doesNotMatch(shell, /label: 'Akun', ids:/)
})

test('bottom navigation mengikuti kontrak role dan Scan berada di posisi tengah', () => {
  assert.match(shell, /teacher: \['dashboard', 'attendance-data', 'attendance', 'students'\]/)
  assert.match(shell, /admin: \['dashboard', 'students', 'attendance', 'attendance-data'\]/)
  assert.match(shell, /parent: \['dashboard', 'children', 'reports', 'payments'\]/)
  assert.match(shell, /label === 'Dashboard'\) return 'Beranda'/)
  assert.match(shell, /item\.id === 'attendance' \? 'scan-center-item' : ''/)
  assert.match(styles, /\.v2-bottom-nav button\.scan-center-item/)
  assert.match(styles, /transform:\s*translateY\(-12px\)/)
})

test('navigation shell menghormati safe-area dan target sentuh mobile', () => {
  assert.match(styles, /env\(safe-area-inset-left\)/)
  assert.match(styles, /env\(safe-area-inset-right\)/)
  assert.match(styles, /env\(safe-area-inset-bottom\)/)
  assert.match(styles, /--touch-target, 44px/)
})

test('state navigasi diekspos ke assistive technology', () => {
  assert.match(shell, /aria-current=\{active\.id === item\.id \? 'page' : undefined\}/)
  assert.match(shell, /aria-expanded=\{moreOpen\}/)
  assert.match(shell, /aria-controls="mobile-more-menu"/)
  assert.match(shell, /role="dialog" aria-modal="true" aria-label="Menu lainnya"/)
  assert.match(shell, /useDialogFocus/)
  assert.match(focusHook, /event\.key === 'Escape'/)
})
