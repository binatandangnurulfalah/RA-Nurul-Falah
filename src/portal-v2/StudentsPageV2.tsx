import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Edit3, Plus, QrCode, Save, Trash2, UsersRound } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { DataListSkeleton, DataTable, type DataTableColumn, ErrorState, MobileDataCard, SearchFilterBar, StatusBadge } from '../components/data'
import { ConfirmDialog, FormField, FormSection } from '../components/forms'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { queryKeys } from '../data/queryKeys'
import { studentLookupsOptions, studentPageOptions, type StudentAcademicYear, type StudentAccount, type StudentClass, type StudentRow } from '../data/queries/students'
import { useDataFilters } from '../data/useDataFilters'
import { userErrorMessage } from '../lib/error-utils'
import { supabase } from '../lib/supabase'
import { ActionMenu, Dialog } from './AppExperience'
import { PAGE_SIZE, PaginationControls, useDebouncedValue } from './DataExperience'
import { Notice } from './PortalPages'

type Account = StudentAccount
type Student = StudentRow
type SchoolClass = StudentClass
type AcademicYear = StudentAcademicYear
type Message = { tone: 'success' | 'error'; text: string }

export default function StudentsPageV2({ role }: { role: 'admin' | 'teacher' }) {
  const queryClient = useQueryClient()
  const canManage = role === 'admin'
  const filters = useDataFilters({ q: '', class: 'all' })
  const search = filters.value('q')
  const classFilter = filters.value('class') || 'all'
  const page = filters.page
  const debouncedSearch = useDebouncedValue(search)
  const pageQuery = useQuery(studentPageOptions({ page, pageSize: PAGE_SIZE, search: debouncedSearch, classFilter }))
  const lookupQuery = useQuery(studentLookupsOptions({ includeParents: canManage }))
  const students = pageQuery.data?.rows ?? []
  const total = pageQuery.data?.total ?? 0
  const parents = lookupQuery.data?.parents ?? []
  const classes = lookupQuery.data?.classes ?? []
  const academicYears = lookupQuery.data?.academicYears ?? []
  const loading = pageQuery.isPending
  const [editing, setEditing] = useState<Student | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [removing, setRemoving] = useState(false)
  const removingRef = useRef(false)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const setSearch = (value: string) => filters.update({ q: value }, { resetPage: true })
  const setClassFilter = (value: string) => filters.update({ class: value }, { resetPage: true })
  const resetFilters = () => filters.reset('q', 'class')

  const closeDelete = () => {
    if (removingRef.current) return
    setDeleting(null)
  }

  const remove = async () => {
    if (!deleting || role !== 'admin' || removingRef.current) return
    removingRef.current = true
    setRemoving(true)
    const { error } = await supabase.from('students').delete().eq('id', deleting.id)
    removingRef.current = false
    setRemoving(false)
    if (error) {
      setMessage({ tone: 'error', text: error.message })
      return
    }
    const shouldGoBack = students.length === 1 && page > 1
    setDeleting(null)
    setMessage({ tone: 'success', text: 'Data murid berhasil dihapus.' })
    await queryClient.invalidateQueries({ queryKey: queryKeys.students.all })
    if (shouldGoBack) filters.setPage(page - 1)
  }

  const actionItems = (student: Student) => [
    { label: 'Tampilkan QR', icon: QrCode, onSelect: () => setQrStudent(student) },
    ...(canManage ? [
      { label: 'Edit data murid', icon: Edit3, onSelect: () => setEditing(student) },
      { label: 'Hapus murid', icon: Trash2, danger: true, onSelect: () => setDeleting(student) },
    ] : []),
  ]

  const columns: DataTableColumn<Student>[] = [
    {
      key: 'student',
      header: 'Murid',
      render: (student) => <div className="data-primary-cell"><span className="data-primary-cell__avatar">{initials(student.full_name)}</span><div className="data-primary-cell__copy"><strong>{student.full_name}</strong><small>{student.nisn ? `NISN ${student.nisn}` : student.nis ? `NIS ${student.nis}` : student.nik ? `NIK ${student.nik}` : 'Identitas belum diisi'}</small></div></div>,
    },
    { key: 'class', header: 'Kelompok', render: (student) => student.class_name || 'Belum ditentukan' },
    { key: 'year', header: 'Tahun Ajaran', render: (student) => student.academic_year || '—' },
    { key: 'status', header: 'Status', render: (student) => <StatusBadge tone={student.is_active ? 'success' : 'neutral'}>{student.is_active ? 'Aktif' : 'Nonaktif'}</StatusBadge> },
    { key: 'actions', header: 'Aksi', align: 'right', render: (student) => <ActionMenu label={`Aksi untuk ${student.full_name}`} items={actionItems(student)} /> },
  ]

  const hasFilters = Boolean(search.trim()) || classFilter !== 'all'
  const emptyState = (
    <EmptyState
      icon={<UsersRound size={24} />}
      title={hasFilters ? 'Tidak ada murid yang cocok' : 'Belum ada data murid'}
      description={hasFilters ? 'Ubah kata pencarian atau reset filter untuk melihat data lainnya.' : 'Data murid akan muncul setelah ditambahkan ke sistem.'}
      action={hasFilters
        ? <Button variant="secondary" onClick={resetFilters}>Reset Filter</Button>
        : canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Murid</Button> : undefined}
    />
  )

  return <div className="v2-stack">
    <PageHeader
      eyebrow="AKADEMIK"
      title="Data Murid"
      subtitle={canManage ? 'Tambah, edit, hubungkan satu atau beberapa wali, tampilkan QR, dan hapus data murid.' : 'Lihat murid pada kelas yang ditugaskan dan tampilkan QR untuk kebutuhan absensi.'}
      actions={canManage ? <Button onClick={() => setEditing('new')}><Plus size={17} /> Tambah Murid</Button> : undefined}
    />
    {message && <Notice {...message} />}
    {lookupQuery.isError && <Notice tone="error" text={userErrorMessage(lookupQuery.error, 'Data pendukung murid gagal dimuat.')} />}
    <section className="v2-panel">
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        placeholder="Cari nama, NIS, NISN atau NIK"
        searchLabel="Cari murid"
        activeFilterCount={classFilter === 'all' ? 0 : 1}
        onReset={resetFilters}
      >
        <select aria-label="Filter kelompok" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
          <option value="all">Semua kelompok</option>
          {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name} · {schoolClass.academic_year}</option>)}
        </select>
      </SearchFilterBar>

      {pageQuery.isError ? <ErrorState description={userErrorMessage(pageQuery.error, 'Data murid gagal dimuat.')} onRetry={() => void pageQuery.refetch()} /> : <>
        <div className="desktop-data-view">
          <DataTable rows={students} columns={columns} getRowKey={(student) => student.id} loading={loading} empty={emptyState} caption="Daftar murid" />
        </div>
        <div className="mobile-data-view">
          {loading ? <DataListSkeleton /> : students.length ? <div className="mobile-data-list">{students.map((student) => (
            <MobileDataCard
              key={student.id}
              leading={initials(student.full_name)}
              title={student.full_name}
              subtitle={student.class_name || 'Belum ada kelompok'}
              badges={<StatusBadge tone={student.is_active ? 'success' : 'neutral'}>{student.is_active ? 'Aktif' : 'Nonaktif'}</StatusBadge>}
              fields={[
                { label: student.nisn ? 'NISN' : student.nis ? 'NIS' : 'NIK', value: student.nisn || student.nis || student.nik || 'Belum diisi' },
                { label: 'Tahun ajaran', value: student.academic_year || '—' },
              ]}
              actions={<ActionMenu label={`Aksi untuk ${student.full_name}`} items={actionItems(student)} />}
            />
          ))}</div> : emptyState}
        </div>
        {!loading && students.length ? <PaginationControls page={page} total={total} onPage={filters.setPage} /> : null}
      </>}
    </section>

    {editing && canManage && <StudentModal
      student={editing === 'new' ? null : editing}
      parents={parents}
      classes={classes}
      academicYears={academicYears}
      onClose={() => setEditing(null)}
      onDone={async () => {
        const wasNew = editing === 'new'
        setEditing(null)
        setMessage({ tone: 'success', text: wasNew ? 'Murid berhasil ditambahkan.' : 'Data murid dan wali berhasil diperbarui.' })
        await queryClient.invalidateQueries({ queryKey: queryKeys.students.all })
      }}
    />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Hapus data murid?"
      description={deleting ? `${deleting.full_name} beserta riwayat absensi dan hubungan walinya akan terhapus.` : ''}
      confirmLabel="Ya, Hapus"
      danger
      busy={removing}
      onClose={closeDelete}
      onConfirm={() => void remove()}
    />
    {qrStudent && <StudentQrModal student={qrStudent} onClose={() => setQrStudent(null)} />}
  </div>
}

function StudentModal({ student, parents, classes, academicYears, onClose, onDone }: {
  student: Student | null
  parents: Account[]
  classes: SchoolClass[]
  academicYears: AcademicYear[]
  onClose: () => void
  onDone: () => void
}) {
  const currentYear = academicYears.find((item) => item.is_current) ?? academicYears[0]
  const initialClass = student?.class_id ? classes.find((item) => item.id === student.class_id) : undefined
  const initialAcademicYearId = student?.academic_year_id || initialClass?.academic_year_id || currentYear?.id || ''
  const [form, setForm] = useState({
    full_name: student?.full_name || '',
    nik: student?.nik || '',
    nis: student?.nis || '',
    nisn: student?.nisn || '',
    gender: student?.gender || '',
    birth_place: student?.birth_place || '',
    birth_date: student?.birth_date || '',
    class_id: student?.class_id || '',
    academic_year_id: initialAcademicYearId,
    active: student?.is_active ?? true,
    guardians: [] as string[],
  })
  const [guardianLoading, setGuardianLoading] = useState(Boolean(student))
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    if (!student) return
    let mounted = true
    setGuardianLoading(true)
    void supabase
      .from('student_guardians')
      .select('guardian_user_id')
      .eq('student_id', student.id)
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) setErrorText('Data wali murid gagal dimuat. Silakan tutup lalu buka kembali formulir.')
        else setForm((current) => ({ ...current, guardians: (data ?? []).map((row) => row.guardian_user_id) }))
        setGuardianLoading(false)
      })
    return () => { mounted = false }
  }, [student])

  const classesForYear = classes.filter((item) => item.academic_year_id === form.academic_year_id)

  const toggleGuardian = (guardianId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      guardians: checked
        ? Array.from(new Set([...current.guardians, guardianId]))
        : current.guardians.filter((id) => id !== guardianId),
    }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (guardianLoading || busyRef.current) return
    const selectedYear = academicYears.find((item) => item.id === form.academic_year_id)
    const selectedClass = classes.find((item) => item.id === form.class_id)
    if (!selectedYear) {
      setErrorText('Pilih tahun ajaran resmi terlebih dahulu.')
      return
    }
    if (selectedClass && selectedClass.academic_year_id !== selectedYear.id) {
      setErrorText('Kelas tidak sesuai dengan tahun ajaran yang dipilih.')
      return
    }

    busyRef.current = true
    setBusy(true)
    setErrorText('')

    const { error } = await supabase.rpc('save_student_with_guardians', {
      p_student_id: student?.id,
      p_full_name: form.full_name.trim(),
      p_nik: form.nik.trim() || undefined,
      p_nis: form.nis.trim() || undefined,
      p_nisn: form.nisn.trim() || undefined,
      p_gender: form.gender || undefined,
      p_birth_place: form.birth_place.trim() || undefined,
      p_birth_date: form.birth_date || undefined,
      p_class_name: selectedClass?.name,
      p_academic_year: selectedYear.label,
      p_is_active: form.active,
      p_guardian_user_ids: form.guardians,
    })

    busyRef.current = false
    setBusy(false)
    if (error) {
      if (error.code === '23505') setErrorText('NIK, NIS, atau NISN sudah digunakan oleh murid lain.')
      else if (error.code === '23503') setErrorText('Kelas atau tahun ajaran tidak valid. Muat ulang halaman lalu coba lagi.')
      else setErrorText(error.message || 'Data murid gagal disimpan.')
      return
    }
    onDone()
  }

  return <Dialog title={student ? 'Edit Murid' : 'Tambah Murid'} eyebrow="DATA MURID" onClose={() => { if (!busyRef.current) onClose() }} wide>
    <form className="v2-form v2-form-grid" onSubmit={submit}>
      <FormSection title="Identitas murid" description="Lengkapi identitas utama. NIK, NIS, dan NISN harus unik bila diisi.">
        <FormField label="Nama lengkap" required><input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></FormField>
        <FormField label="NIK" helper="Maksimal 16 digit"><input inputMode="numeric" maxLength={16} value={form.nik} onChange={(event) => setForm({ ...form, nik: event.target.value.replace(/\D/g, '').slice(0, 16) })} /></FormField>
        <FormField label="NIS"><input value={form.nis} onChange={(event) => setForm({ ...form, nis: event.target.value })} /></FormField>
        <FormField label="NISN"><input value={form.nisn} onChange={(event) => setForm({ ...form, nisn: event.target.value })} /></FormField>
        <FormField label="Jenis kelamin"><select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value as '' | 'L' | 'P' })}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></FormField>
        <FormField label="Tempat lahir"><input value={form.birth_place} onChange={(event) => setForm({ ...form, birth_place: event.target.value })} /></FormField>
        <FormField label="Tanggal lahir"><input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></FormField>
      </FormSection>

      <FormSection title="Akademik" description="Kelompok dan tahun ajaran dipilih dari data resmi sekolah; tidak ada input tahun bebas.">
        <FormField label="Tahun ajaran" required>
          <select required value={form.academic_year_id} onChange={(event) => {
            const academicYearId = event.target.value
            const selectedClass = classes.find((item) => item.id === form.class_id)
            setForm({ ...form, academic_year_id: academicYearId, class_id: selectedClass?.academic_year_id === academicYearId ? form.class_id : '' })
          }}>
            <option value="">Pilih tahun ajaran</option>
            {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}{year.is_current ? ' · Berjalan' : ''}</option>)}
          </select>
        </FormField>
        <FormField label="Kelompok">
          <select value={form.class_id} onChange={(event) => setForm({ ...form, class_id: event.target.value })}>
            <option value="">Belum ditentukan</option>
            {classesForYear.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
          </select>
        </FormField>
        <label className="v2-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Murid aktif</span></label>
      </FormSection>

      <fieldset className="full v5-teacher-picker">
        <legend>Wali murid terhubung</legend>
        {guardianLoading ? <p>Memuat data wali...</p> : parents.length ? parents.map((parent) => <label key={parent.id}>
          <input type="checkbox" checked={form.guardians.includes(parent.id)} onChange={(event) => toggleGuardian(parent.id, event.target.checked)} />
          <span>{parent.display_name || 'Wali murid'}<small>{form.guardians.includes(parent.id) ? 'Terhubung ke murid' : 'Belum terhubung'}</small></span>
        </label>) : <p>Belum ada akun Orang Tua/Wali aktif. Data murid tetap dapat disimpan tanpa akun wali.</p>}
      </fieldset>
      <p className="full helper-text">Satu murid dapat dihubungkan ke beberapa akun wali. Perubahan data murid dan daftar wali disimpan sekaligus dalam satu transaksi.</p>

      {errorText && <p className="v2-field-error full">{errorText}</p>}
      <div className="v2-form-actions full">
        <button type="button" className="v2-secondary" disabled={busy} onClick={onClose}>Batal</button>
        <button className="v2-primary" disabled={busy || guardianLoading}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan Murid'}</button>
      </div>
    </form>
  </Dialog>
}

function StudentQrModal({ student, onClose }: { student: Student; onClose: () => void }) {
  return <Dialog title={student.full_name} onClose={onClose}>
    <p>{student.nis ? `NIS ${student.nis} · ` : ''}{student.class_name || 'RA Nurul Falah'}</p>
    <div className="v2-qr"><QRCodeSVG value={`RA-NF:${student.qr_token}`} size={230} level="H" includeMargin /></div>
    <small>QR digunakan untuk absensi masuk dan pulang.</small>
    <button className="v2-primary full-button" onClick={() => window.print()}><QrCode size={17} /> Cetak QR</button>
  </Dialog>
}

function initials(name?: string | null) {
  return (name || 'Murid').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
