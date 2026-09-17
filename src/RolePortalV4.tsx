import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeDollarSign,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  ContactRound,
  FileText,
  GraduationCap,
  History,
  Home,
  LogOut,
  Megaphone,
  MoreHorizontal,
  QrCode,
  Settings,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from './lib/supabase'
import { ChildSelectionProvider, GlobalChildSwitcher, OfflineBanner } from './portal-v2/AppExperience'
import './portal-v2.css'
import './portal-v2-polish.css'
import './school-modules.css'
import './scanner-native.css'

type NavItem = { id: string; label: string; icon: typeof Home }

const AccountsPage = lazy(() => import('./portal-v2/AccountsPage').then((module) => ({ default: module.AccountsPage })))
const AnnouncementsPage = lazy(() => import('./portal-v2/AnnouncementsPage').then((module) => ({ default: module.AnnouncementsPage })))
const AuditTrailPage = lazy(() => import('./portal-v2/AuditTrailPage').then((module) => ({ default: module.AuditTrailPage })))
const ClassesPage = lazy(() => import('./portal-v2/ClassesPage').then((module) => ({ default: module.ClassesPage })))
const SchedulePage = lazy(() => import('./portal-v2/CrudPages').then((module) => ({ default: module.SchedulePage })))
const StudentsPage = lazy(() => import('./portal-v2/CrudPages').then((module) => ({ default: module.StudentsPage })))
const AttendanceDataManager = lazy(() => import('./portal-v2/AttendancePages').then((module) => ({ default: module.AttendanceDataManager })))
const AttendanceScannerNative = lazy(() => import('./portal-v2/AttendanceScannerNative').then((module) => ({ default: module.AttendanceScannerNative })))
const ChildrenPage = lazy(() => import('./portal-v2/PortalPages').then((module) => ({ default: module.ChildrenPage })))
const DashboardPage = lazy(() => import('./portal-v2/PortalPages').then((module) => ({ default: module.DashboardPage })))
const SettingsPage = lazy(() => import('./portal-v2/PortalPages').then((module) => ({ default: module.SettingsPage })))
const ProfilePageV3 = lazy(() => import('./portal-v2/ProfilePageV3').then((module) => ({ default: module.ProfilePageV3 })))
const DocumentsPage = lazy(() => import('./portal-v2/SchoolModules').then((module) => ({ default: module.DocumentsPage })))
const PaymentsPage = lazy(() => import('./portal-v2/SchoolModules').then((module) => ({ default: module.PaymentsPage })))
const ReportsPage = lazy(() => import('./portal-v2/SchoolModules').then((module) => ({ default: module.ReportsPage })))
const TeachersPage = lazy(() => import('./portal-v2/SchoolModules').then((module) => ({ default: module.TeachersPage })))

const menus: Record<AppRole, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'accounts', label: 'Manajemen Akun', icon: UsersRound },
    { id: 'attendance-data', label: 'Data Absen', icon: ClipboardCheck },
    { id: 'students', label: 'Data Murid', icon: GraduationCap },
    { id: 'teachers', label: 'Data Guru', icon: ContactRound },
    { id: 'reports', label: 'Penilaian & Rapor', icon: BookOpenCheck },
    { id: 'payments', label: 'Pembayaran', icon: BadgeDollarSign },
    { id: 'documents', label: 'Dokumen & Surat', icon: FileText },
    { id: 'attendance', label: 'Scan Absensi', icon: QrCode },
    { id: 'classes', label: 'Kelas & Tahun Ajaran', icon: GraduationCap },
    { id: 'schedule', label: 'Jadwal', icon: CalendarDays },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'audit', label: 'Riwayat Aktivitas', icon: History },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
    { id: 'profile', label: 'Profil Saya', icon: UserRound },
  ],
  teacher: [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'attendance', label: 'Scan Absensi', icon: QrCode },
    { id: 'attendance-data', label: 'Data Absen', icon: ClipboardCheck },
    { id: 'students', label: 'Data Murid', icon: UsersRound },
    { id: 'reports', label: 'Penilaian & Rapor', icon: BookOpenCheck },
    { id: 'schedule', label: 'Jadwal', icon: CalendarDays },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'documents', label: 'Dokumen & Surat', icon: FileText },
    { id: 'profile', label: 'Profil Saya', icon: UserRound },
  ],
  parent: [
    { id: 'dashboard', label: 'Beranda', icon: Home },
    { id: 'children', label: 'Data Anak', icon: UsersRound },
    { id: 'attendance-data', label: 'Data Absen', icon: ClipboardCheck },
    { id: 'schedule', label: 'Jadwal', icon: CalendarDays },
    { id: 'reports', label: 'Rapor Anak', icon: BookOpenCheck },
    { id: 'payments', label: 'Pembayaran', icon: BadgeDollarSign },
    { id: 'announcements', label: 'Pengumuman', icon: Megaphone },
    { id: 'documents', label: 'Dokumen & Surat', icon: FileText },
    { id: 'profile', label: 'Profil Keluarga', icon: UserRound },
  ],
}

export default function RolePortalV4({ profile }: { profile: UserProfile }) {
  return <ChildSelectionProvider enabled={profile.role === 'parent'}><RolePortalShell profile={profile} /></ChildSelectionProvider>
}

function RolePortalShell({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [currentProfile, setCurrentProfile] = useState(profile)
  const [moreOpen, setMoreOpen] = useState(false)
  const [announcementCount, setAnnouncementCount] = useState(0)

  const base = currentProfile.role === 'teacher' ? '/guru' : currentProfile.role === 'parent' ? '/orang-tua' : '/admin'
  const menu = menus[currentProfile.role]
  const page = location.pathname.split('/')[2] || 'dashboard'
  const active = menu.find((item) => item.id === page) ?? menu[0]

  const mobilePrimary = useMemo(() => {
    const preferred = currentProfile.role === 'teacher'
      ? ['dashboard', 'attendance-data', 'attendance', 'students']
      : currentProfile.role === 'admin'
        ? ['dashboard', 'students', 'attendance', 'attendance-data']
        : ['dashboard', 'children', 'reports', 'payments']
    return preferred
      .map((id) => menu.find((item) => item.id === id))
      .filter((item): item is NavItem => Boolean(item))
  }, [currentProfile.role, menu])

  const mobileSecondary = useMemo(
    () => menu.filter((item) => !mobilePrimary.some((primary) => primary.id === item.id)),
    [menu, mobilePrimary],
  )
  const moreIsActive = mobileSecondary.some((item) => item.id === active.id)

  const groupedSecondary = useMemo(() => {
    const groups = currentProfile.role === 'admin'
      ? [
          ['Akademik', ['students', 'teachers', 'classes', 'schedule', 'reports']],
          ['Kehadiran', ['attendance', 'attendance-data']],
          ['Administrasi', ['payments', 'documents', 'announcements']],
          ['Sistem', ['accounts', 'audit', 'settings', 'profile']],
        ] as const
      : currentProfile.role === 'teacher'
        ? [
            ['Akademik', ['students', 'schedule', 'reports']],
            ['Kehadiran', ['attendance', 'attendance-data']],
            ['Informasi', ['documents', 'announcements']],
            ['Akun', ['profile']],
          ] as const
        : [
            ['Aktivitas Anak', ['attendance-data', 'schedule']],
            ['Informasi', ['announcements', 'documents']],
            ['Akun', ['profile']],
          ] as const
    return groups.map(([label, ids]) => ({
      label,
      items: ids.map((id) => mobileSecondary.find((item) => item.id === id)).filter((item): item is NavItem => Boolean(item)),
    })).filter((group) => group.items.length)
  }, [currentProfile.role, mobileSecondary])

  useEffect(() => {
    let mounted = true
    const loadUnread = () => {
      const query = currentProfile.role === 'parent'
        ? supabase.from('announcements').select('id').eq('is_published', true).in('audience', ['all', 'parent'])
        : currentProfile.role === 'teacher'
          ? supabase.from('announcements').select('id').eq('is_published', true).in('audience', ['all', 'teacher'])
          : supabase.from('announcements').select('id').eq('is_published', true)
      void query.then(({ data }) => { if (!mounted) return; let stored: string[] = []; try { stored = JSON.parse(localStorage.getItem('ra_read_announcements') || '[]') as string[] } catch { localStorage.removeItem('ra_read_announcements') }; const read = new Set(stored); setAnnouncementCount((data ?? []).filter((row) => !read.has(row.id)).length) })
    }
    loadUnread()
    window.addEventListener('ra-announcements-read', loadUnread)
    return () => { mounted = false; window.removeEventListener('ra-announcements-read', loadUnread) }
  }, [currentProfile.role])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  const go = (id: string) => {
    navigate(id === 'dashboard' ? base : `${base}/${id}`)
    setMoreOpen(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="v2-shell">
      <aside className="v2-sidebar">
        <div className="v2-brand"><img className="v2-brand-logo" src={`${import.meta.env.BASE_URL}logo-ra-nurul-falah.png`} alt="Logo RA Nurul Falah" /><div><strong>Nurul Falah</strong><small>Sistem Informasi Sekolah</small></div></div>
        <nav className="v2-side-nav"><small className="v2-nav-caption">MENU UTAMA</small>{menu.map((item) => <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}><span className="v2-nav-icon"><item.icon size={19} /></span><span>{item.label}</span>{item.id === 'announcements' && announcementCount > 0 && <b>{announcementCount}</b>}</button>)}</nav>
        <div className="v2-sidebar-profile"><span className="v2-avatar large">{initials(currentProfile.display_name)}</span><div><strong>{currentProfile.display_name || roleLabel(currentProfile.role)}</strong><small>{roleLabel(currentProfile.role)}</small></div><button aria-label="Keluar" onClick={() => void logout()}><LogOut size={18} /></button></div>
      </aside>

      <div className="v2-main">
        <header className="v2-topbar">
          <img className="v2-mobile-logo" src={`${import.meta.env.BASE_URL}logo-ra-nurul-falah.png`} alt="" />
          <div className="v2-top-title"><h1>{active.label}</h1><small>{roleLabel(currentProfile.role)}</small></div>
          <div className="v2-top-actions"><button className="v2-bell" onClick={() => go('announcements')} aria-label="Pengumuman"><Bell size={20} />{announcementCount > 0 && <i>{Math.min(announcementCount, 9)}</i>}</button><button className="v2-top-profile" onClick={() => go('profile')}><span>{initials(currentProfile.display_name)}</span><div><strong>{currentProfile.display_name || 'Pengguna'}</strong><small>{roleLabel(currentProfile.role)}</small></div></button></div>
        </header>

        <main className="v2-content">
          <OfflineBanner />
          {currentProfile.role === 'parent' && <GlobalChildSwitcher />}
          <Suspense fallback={<PageLoading />}><PageRouter role={currentProfile.role} page={active.id} profile={currentProfile} setProfile={setCurrentProfile} go={go} /></Suspense>
        </main>
      </div>

      <nav className="v2-bottom-nav" aria-label="Navigasi utama mobile">
        {mobilePrimary.map((item) => (
          <button
            key={item.id}
            className={`${active.id === item.id ? 'active' : ''} ${item.id === 'attendance' ? 'scan-center-item' : ''}`}
            onClick={() => go(item.id)}
          >
            <span><item.icon size={item.id === 'attendance' ? 25 : 21} /></span>
            <small>{mobileLabel(item.label)}</small>
          </button>
        ))}
        <button className={moreIsActive || moreOpen ? 'active' : ''} onClick={() => setMoreOpen(true)}><span><MoreHorizontal size={22} /></span><small>Lainnya</small></button>
      </nav>

      {moreOpen && <div className="v2-sheet-layer"><button className="v2-sheet-backdrop" aria-label="Tutup" onClick={() => setMoreOpen(false)} /><section className="v2-sheet"><div className="v2-sheet-handle" /><header><div><small>NAVIGASI</small><h3>Menu lainnya</h3></div><button onClick={() => setMoreOpen(false)} aria-label="Tutup menu"><X size={19} /></button></header><div className="v5-sheet-scroll">{groupedSecondary.map((group) => <section className="v5-menu-group" key={group.label}><h4>{group.label}</h4><div className="v2-sheet-grid">{group.items.map((item) => <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}><span><item.icon size={21} /></span><div><strong>{item.label}</strong><small>Buka halaman</small></div></button>)}</div></section>)}<section className="v5-menu-group"><h4>Sesi</h4><div className="v2-sheet-grid"><button className="danger" onClick={() => void logout()}><span><LogOut size={21} /></span><div><strong>Keluar</strong><small>Akhiri sesi akun</small></div></button></div></section></div></section></div>}
    </div>
  )
}

function PageRouter({ role, page, profile, setProfile, go }: { role: AppRole; page: string; profile: UserProfile; setProfile: (profile: UserProfile) => void; go: (page: string) => void }) {
  if (page === 'dashboard') return <DashboardPage role={role} profile={profile} go={go} />
  if (page === 'attendance-data') return <AttendanceDataManager canManage={role !== 'parent'} parentView={role === 'parent'} />
  if (page === 'attendance' && role !== 'parent') return <AttendanceScannerNative />
  if (page === 'accounts' && role === 'admin') return <AccountsPage />
  if (page === 'students' && role !== 'parent') return <StudentsPage role={role} />
  if (page === 'teachers' && role === 'admin') return <TeachersPage />
  if (page === 'reports') return <ReportsPage role={role} />
  if (page === 'payments' && role !== 'teacher') return <PaymentsPage role={role} />
  if (page === 'documents') return <DocumentsPage role={role} />
  if (page === 'classes' && role === 'admin') return <ClassesPage />
  if (page === 'schedule') return <SchedulePage canManage={role !== 'parent'} />
  if (page === 'announcements') return <AnnouncementsPage role={role} currentUserId={profile.id} />
  if (page === 'audit' && role === 'admin') return <AuditTrailPage />
  if (page === 'settings' && role === 'admin') return <SettingsPage />
  if (page === 'children' && role === 'parent') return <ChildrenPage />
  if (page === 'profile') return <ProfilePageV3 profile={profile} onProfileChange={setProfile} />
  return <DashboardPage role={role} profile={profile} go={go} />
}

function PageLoading() { return <div className="v5-page-loading" role="status" aria-live="polite"><span /><span /><span /><p>Memuat halaman…</p></div> }

function initials(name?: string | null) { return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function roleLabel(role: AppRole) { return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Orang Tua / Wali' }
function mobileLabel(label: string) { if (label === 'Manajemen Akun') return 'Akun'; if (label === 'Data Absen') return 'Absen'; if (label === 'Data Murid') return 'Murid'; if (label === 'Data Anak') return 'Anak'; if (label === 'Scan Absensi') return 'Scan'; if (label === 'Penilaian & Rapor') return 'Rapor'; if (label === 'Rapor Anak') return 'Rapor'; if (label === 'Dokumen & Surat') return 'Dokumen'; return label.split(' ')[0] }
