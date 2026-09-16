import { useEffect, useMemo, useState } from 'react'
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
  Home,
  LogOut,
  Megaphone,
  Menu,
  MoreHorizontal,
  QrCode,
  Settings,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { type AppRole, supabase, type UserProfile } from './lib/supabase'
import { AccountsPage, AnnouncementsPage, ClassesPage, SchedulePage, StudentsPage } from './portal-v2/CrudPages'
import { AttendanceDataManager, AttendanceScannerPage } from './portal-v2/AttendancePages'
import { ChildrenPage, DashboardPage, SettingsPage } from './portal-v2/PortalPages'
import { ProfilePageV3 } from './portal-v2/ProfilePageV3'
import { DocumentsPage, ModuleLaunchpad, PaymentsPage, ReportsPage, TeachersPage } from './portal-v2/SchoolModules'
import './portal-v2.css'
import './portal-v2-polish.css'
import './school-modules.css'

type NavItem = { id: string; label: string; icon: typeof Home }

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
  const navigate = useNavigate()
  const location = useLocation()
  const [currentProfile, setCurrentProfile] = useState(profile)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [announcementCount, setAnnouncementCount] = useState(0)

  const base = currentProfile.role === 'teacher' ? '/guru' : currentProfile.role === 'parent' ? '/orang-tua' : '/admin'
  const menu = menus[currentProfile.role]
  const page = location.pathname.split('/')[2] || 'dashboard'
  const active = menu.find((item) => item.id === page) ?? menu[0]
  const mobilePrimary = useMemo(() => menu.slice(0, 4), [menu])
  const mobileSecondary = useMemo(() => menu.slice(4), [menu])
  const moreIsActive = mobileSecondary.some((item) => item.id === active.id)

  useEffect(() => {
    let mounted = true
    const query = currentProfile.role === 'parent'
      ? supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('is_published', true).in('audience', ['all', 'parent'])
      : supabase.from('announcements').select('id', { count: 'exact', head: true }).eq('is_published', true)
    void query.then(({ count }) => { if (mounted) setAnnouncementCount(count ?? 0) })
    return () => { mounted = false }
  }, [currentProfile.role])

  const go = (id: string) => {
    navigate(id === 'dashboard' ? base : `${base}/${id}`)
    setSidebarOpen(false)
    setMoreOpen(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="v2-shell">
      <aside className={`v2-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="v2-brand"><span className="v2-brand-mark">RA</span><div><strong>Nurul Falah</strong><small>Sistem Informasi Sekolah</small></div></div>
        <nav className="v2-side-nav"><small className="v2-nav-caption">MENU UTAMA</small>{menu.map((item) => <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}><span className="v2-nav-icon"><item.icon size={19} /></span><span>{item.label}</span>{item.id === 'announcements' && announcementCount > 0 && <b>{announcementCount}</b>}</button>)}</nav>
        <div className="v2-sidebar-profile"><span className="v2-avatar large">{initials(currentProfile.display_name)}</span><div><strong>{currentProfile.display_name || roleLabel(currentProfile.role)}</strong><small>{roleLabel(currentProfile.role)}</small></div><button aria-label="Keluar" onClick={() => void logout()}><LogOut size={18} /></button></div>
      </aside>

      {sidebarOpen && <button className="v2-sidebar-backdrop" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}

      <div className="v2-main">
        <header className="v2-topbar">
          <button className="v2-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Buka menu"><Menu size={22} /></button>
          <div className="v2-top-title"><small>{roleLabel(currentProfile.role)}</small><h1>{active.label}</h1></div>
          <div className="v2-top-actions"><button className="v2-bell" onClick={() => go('announcements')} aria-label="Pengumuman"><Bell size={20} />{announcementCount > 0 && <i>{Math.min(announcementCount, 9)}</i>}</button><button className="v2-top-profile" onClick={() => go('profile')}><span>{initials(currentProfile.display_name)}</span><div><strong>{currentProfile.display_name || 'Pengguna'}</strong><small>{roleLabel(currentProfile.role)}</small></div></button></div>
        </header>

        <main className="v2-content">
          <PageRouter role={currentProfile.role} page={active.id} profile={currentProfile} setProfile={setCurrentProfile} go={go} />
        </main>
      </div>

      <nav className="v2-bottom-nav" aria-label="Navigasi utama mobile">
        {mobilePrimary.map((item) => <button key={item.id} className={`${active.id === item.id ? 'active' : ''} ${item.id === 'attendance-data' ? 'center-item' : ''}`} onClick={() => go(item.id)}><span><item.icon size={item.id === 'attendance-data' ? 24 : 21} /></span><small>{mobileLabel(item.label)}</small></button>)}
        <button className={moreIsActive || moreOpen ? 'active' : ''} onClick={() => setMoreOpen(true)}><span><MoreHorizontal size={22} /></span><small>Lainnya</small></button>
      </nav>

      {moreOpen && <div className="v2-sheet-layer"><button className="v2-sheet-backdrop" aria-label="Tutup" onClick={() => setMoreOpen(false)} /><section className="v2-sheet"><div className="v2-sheet-handle" /><header><div><small>NAVIGASI</small><h3>Menu lainnya</h3></div><button onClick={() => setMoreOpen(false)}><X size={19} /></button></header><div className="v2-sheet-grid">{mobileSecondary.map((item) => <button key={item.id} className={active.id === item.id ? 'active' : ''} onClick={() => go(item.id)}><span><item.icon size={21} /></span><div><strong>{item.label}</strong><small>Buka halaman</small></div></button>)}<button className="danger" onClick={() => void logout()}><span><LogOut size={21} /></span><div><strong>Keluar</strong><small>Akhiri sesi akun</small></div></button></div></section></div>}
    </div>
  )
}

function PageRouter({ role, page, profile, setProfile, go }: { role: AppRole; page: string; profile: UserProfile; setProfile: (profile: UserProfile) => void; go: (page: string) => void }) {
  if (page === 'dashboard') return <><DashboardPage role={role} profile={profile} go={go} /><ModuleLaunchpad role={role} go={go} /></>
  if (page === 'attendance-data') return <AttendanceDataManager canManage={role !== 'parent'} parentView={role === 'parent'} />
  if (page === 'attendance' && role !== 'parent') return <AttendanceScannerPage />
  if (page === 'accounts' && role === 'admin') return <AccountsPage />
  if (page === 'students' && role !== 'parent') return <StudentsPage role={role} />
  if (page === 'teachers' && role === 'admin') return <TeachersPage />
  if (page === 'reports') return <ReportsPage role={role} />
  if (page === 'payments' && role !== 'teacher') return <PaymentsPage role={role} />
  if (page === 'documents') return <DocumentsPage role={role} />
  if (page === 'classes' && role === 'admin') return <ClassesPage />
  if (page === 'schedule') return <SchedulePage canManage={role !== 'parent'} />
  if (page === 'announcements') return <AnnouncementsPage canManage={role !== 'parent'} />
  if (page === 'settings' && role === 'admin') return <SettingsPage />
  if (page === 'children' && role === 'parent') return <ChildrenPage />
  if (page === 'profile') return <ProfilePageV3 profile={profile} onProfileChange={setProfile} />
  return <><DashboardPage role={role} profile={profile} go={go} /><ModuleLaunchpad role={role} go={go} /></>
}

function initials(name?: string | null) { return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() }
function roleLabel(role: AppRole) { return role === 'admin' ? 'Administrator' : role === 'teacher' ? 'Guru' : 'Orang Tua / Wali' }
function mobileLabel(label: string) { if (label === 'Manajemen Akun') return 'Akun'; if (label === 'Data Absen') return 'Absen'; if (label === 'Data Murid') return 'Murid'; if (label === 'Data Anak') return 'Anak'; if (label === 'Scan Absensi') return 'Scan'; if (label === 'Penilaian & Rapor') return 'Rapor'; if (label === 'Rapor Anak') return 'Rapor'; if (label === 'Dokumen & Surat') return 'Dokumen'; return label.split(' ')[0] }
