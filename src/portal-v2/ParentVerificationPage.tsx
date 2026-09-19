import { type FormEvent, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, Search, ShieldCheck, UserRound, XCircle } from 'lucide-react'
import { FormDialog } from '../components/forms'
import { StatusBadge } from '../components/data'
import { Button, EmptyState, PageHeader } from '../components/ui'
import { queryKeys } from '../data/queryKeys'
import { verificationCandidatesOptions, verificationQueueOptions, type StudentCandidateRow, type VerificationRequestRow, type VerificationStatus } from '../data/queries/parentVerification'
import { userErrorMessage } from '../lib/error-utils'
import { supabase } from '../lib/supabase'
import { Dialog } from './AppExperience'
import { Notice } from './PortalPages'
import { useDebouncedValue } from './DataExperience'

const fieldLabels: Record<string, string> = {
  account_display_name: 'Nama pemilik akun',
  primary_phone: 'Telepon utama',
  family_card_no: 'Nomor KK',
  family_address: 'Alamat keluarga',
  father_name: 'Nama Ayah',
  father_nik: 'NIK Ayah',
  father_birth_place: 'Tempat lahir Ayah',
  father_birth_date: 'Tanggal lahir Ayah',
  father_phone: 'Telepon Ayah',
  father_education: 'Pendidikan Ayah',
  father_occupation: 'Pekerjaan Ayah',
  mother_name: 'Nama Ibu',
  mother_nik: 'NIK Ibu',
  mother_birth_place: 'Tempat lahir Ibu',
  mother_birth_date: 'Tanggal lahir Ibu',
  mother_phone: 'Telepon Ibu',
  mother_education: 'Pendidikan Ibu',
  mother_occupation: 'Pekerjaan Ibu',
  guardian_name: 'Nama Wali',
  guardian_nik: 'NIK Wali',
  guardian_relationship: 'Hubungan Wali',
  guardian_phone: 'Telepon Wali',
  guardian_education: 'Pendidikan Wali',
  guardian_occupation: 'Pekerjaan Wali',
  emergency_contact_name: 'Kontak darurat',
  emergency_contact_phone: 'Telepon darurat',
  full_name: 'Nama anak',
  nik: 'NIK anak',
  nisn: 'NISN',
  gender: 'Jenis kelamin',
  birth_place: 'Tempat lahir',
  birth_date: 'Tanggal lahir',
  relationship_to_child: 'Hubungan dengan anak',
}

function statusLabel(status: VerificationStatus) {
  return status === 'pending' ? 'Menunggu verifikasi'
    : status === 'approved' ? 'Disetujui'
      : status === 'changes_requested' ? 'Perlu perbaikan'
        : 'Ditolak'
}

function statusTone(status: VerificationStatus) {
  return status === 'approved' ? 'success' : status === 'pending' ? 'warning' : status === 'changes_requested' ? 'info' : 'danger'
}

function typeLabel(type: VerificationRequestRow['request_type']) {
  return type === 'family_profile' ? 'Data keluarga' : type === 'child_link' ? 'Tambah anak' : 'Perubahan data anak'
}

export default function ParentVerificationPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<VerificationStatus | 'all'>('pending')
  const queueQuery = useQuery(verificationQueueOptions(status))
  const rows = queueQuery.data ?? []
  const [selected, setSelected] = useState<VerificationRequestRow | null>(null)
  const [candidateSearch, setCandidateSearch] = useState('')
  const debouncedCandidateSearch = useDebouncedValue(candidateSearch, 250)
  const candidateQuery = useQuery(verificationCandidatesOptions(debouncedCandidateSearch, Boolean(selected?.request_type === 'child_link')))
  const [matchedStudentId, setMatchedStudentId] = useState('')
  const [reviewMode, setReviewMode] = useState<'request_changes' | 'reject' | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const open = (request: VerificationRequestRow) => {
    setSelected(request)
    setMatchedStudentId(request.matched_student_id || '')
    setCandidateSearch(String(request.proposed_data.full_name || ''))
    setErrorText('')
  }

  const review = async (action: 'approve' | 'request_changes' | 'reject', comment?: string) => {
    if (!selected || busy) return
    if (action === 'approve' && selected.request_type === 'child_link' && !matchedStudentId) {
      setErrorText('Pilih siswa resmi RA Nurul Falah yang sesuai sebelum menyetujui.')
      return
    }

    setBusy(true)
    setErrorText('')
    const { error } = await supabase.rpc('review_parent_verification_request', {
      p_request_id: selected.id,
      p_action: action,
      p_comment: comment || undefined,
      p_matched_student_id: selected.request_type === 'child_link' ? matchedStudentId : undefined,
    })
    setBusy(false)
    if (error) {
      setErrorText(userErrorMessage(error, 'Verifikasi gagal disimpan.'))
      return
    }

    setReviewMode(null)
    setReviewComment('')
    setSelected(null)
    setMessage({
      tone: 'success',
      text: action === 'approve' ? 'Pengajuan berhasil disetujui dan data resmi telah diperbarui.' : action === 'request_changes' ? 'Permintaan perbaikan berhasil dikirim ke Orang Tua/Wali.' : 'Pengajuan berhasil ditolak.',
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.verification.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.students.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ])
  }

  const submitReview = (event: FormEvent) => {
    event.preventDefault()
    if (!reviewMode) return
    void review(reviewMode, reviewComment)
  }

  return <div className="v2-stack verification-page">
    <PageHeader eyebrow="VALIDASI DATA" title="Verifikasi Data Orang Tua" subtitle="Periksa data keluarga, penambahan anak, dan perubahan identitas sebelum menjadi data resmi sekolah." />
    {message && <Notice {...message} />}
    <section className="family-verification-note"><ShieldCheck size={21} /><div><strong>Guru menjadi pemeriksa data</strong><p>Untuk penambahan anak, cocokkan pengajuan dengan siswa resmi. Orang Tua tidak pernah melihat daftar siswa sekolah.</p></div></section>

    <section className="v2-panel">
      <div className="verification-toolbar">
        <div>
          <button className={status === 'pending' ? 'active' : ''} onClick={() => setStatus('pending')}>Menunggu</button>
          <button className={status === 'changes_requested' ? 'active' : ''} onClick={() => setStatus('changes_requested')}>Perlu perbaikan</button>
          <button className={status === 'approved' ? 'active' : ''} onClick={() => setStatus('approved')}>Disetujui</button>
          <button className={status === 'rejected' ? 'active' : ''} onClick={() => setStatus('rejected')}>Ditolak</button>
          <button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')}>Semua</button>
        </div>
        <span>{rows.length} pengajuan</span>
      </div>

      {queueQuery.isError ? <Notice tone="error" text={userErrorMessage(queueQuery.error, 'Antrean verifikasi gagal dimuat.')} /> : queueQuery.isPending ? <p>Memuat antrean verifikasi...</p> : rows.length ? <div className="verification-request-list">{rows.map((request) => <button key={request.id} className="verification-request-card" onClick={() => open(request)}>
        <span className="verification-request-icon"><UserRound size={19} /></span>
        <div><small>{typeLabel(request.request_type)}</small><strong>{request.parent_display_name}</strong><p>{request.request_type === 'family_profile' ? 'Perubahan data keluarga' : String(request.proposed_data.full_name || 'Data anak')}</p><time>{new Date(request.submitted_at).toLocaleString('id-ID')}</time></div>
        <StatusBadge tone={statusTone(request.status)}>{statusLabel(request.status)}</StatusBadge>
        <ChevronRight size={18} />
      </button>)}</div> : <EmptyState icon={<CheckCircle2 size={24} />} title="Tidak ada pengajuan pada status ini" description="Antrean akan muncul ketika Orang Tua/Wali mengirim data baru atau perubahan." />}
    </section>

    {selected && !reviewMode && <Dialog title={typeLabel(selected.request_type)} eyebrow="VERIFIKASI DATA" onClose={() => { if (!busy) setSelected(null) }} wide>
      <div className="verification-detail">
        <header><div><small>Orang Tua / Wali</small><h3>{selected.parent_display_name}</h3><p>Diajukan {new Date(selected.submitted_at).toLocaleString('id-ID')}</p></div><StatusBadge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</StatusBadge></header>

        <section><h4>Perbandingan data</h4><div className="verification-compare">{Object.entries(selected.proposed_data).map(([key, proposed]) => {
          const current = selected.current_data?.[key] ?? null
          const changed = String(current ?? '') !== String(proposed ?? '')
          return <div className={changed ? 'changed' : ''} key={key}><small>{fieldLabels[key] || key}</small><span><b>Sebelum</b>{displayValue(key, current)}</span><span><b>Diajukan</b>{displayValue(key, proposed)}</span></div>
        })}</div></section>

        {selected.request_type === 'child_link' && selected.status === 'pending' ? <section className="verification-candidates">
          <h4>Cocokkan dengan siswa resmi</h4>
          <p>Cari berdasarkan nama, NIS, NISN, atau NIK. Hanya Guru yang dapat melihat daftar ini.</p>
          <label className="verification-search"><Search size={16} /><input value={candidateSearch} onChange={(e) => setCandidateSearch(e.target.value)} placeholder="Cari siswa resmi..." /></label>
          {candidateQuery.isError ? <Notice tone="error" text="Daftar siswa resmi gagal dimuat." /> : <div className="verification-candidate-list">{(candidateQuery.data ?? []).map((student) => <CandidateCard key={student.id} student={student} selected={matchedStudentId === student.id} onSelect={() => setMatchedStudentId(student.id)} />)}</div>}
        </section> : null}

        {selected.review_comment ? <section className="verification-review-note"><strong>Komentar pemeriksa</strong><p>{selected.review_comment}</p></section> : null}
        {errorText ? <p className="v2-field-error">{errorText}</p> : null}

        {selected.status === 'pending' ? <footer className="verification-actions">
          <Button variant="danger" disabled={busy} onClick={() => { setReviewMode('reject'); setReviewComment('') }}><XCircle size={16} /> Tolak</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setReviewMode('request_changes'); setReviewComment('') }}>Minta Perbaikan</Button>
          <Button disabled={busy || (selected.request_type === 'child_link' && !matchedStudentId)} onClick={() => void review('approve')}><CheckCircle2 size={16} /> {busy ? 'Memproses...' : 'Setujui'}</Button>
        </footer> : null}
      </div>
    </Dialog>}

    <FormDialog
      open={Boolean(reviewMode)}
      title={reviewMode === 'reject' ? 'Tolak Pengajuan' : 'Minta Perbaikan'}
      description={reviewMode === 'reject' ? 'Jelaskan alasan penolakan agar Orang Tua/Wali memahami keputusan sekolah.' : 'Jelaskan bagian yang harus diperbaiki sebelum data dapat disetujui.'}
      submitLabel={reviewMode === 'reject' ? 'Kirim Penolakan' : 'Kirim Permintaan Perbaikan'}
      submitVariant={reviewMode === 'reject' ? 'danger' : 'primary'}
      submitDisabled={reviewComment.trim().length < 5}
      busy={busy}
      error={errorText}
      onClose={() => setReviewMode(null)}
      onSubmit={submitReview}
    >
      <label className="form-field"><span className="form-field__label">Komentar / alasan <b>*</b></span><textarea rows={5} maxLength={1500} required value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Contoh: Nama anak belum sesuai dengan akta kelahiran. Silakan perbaiki dan kirim ulang." /></label>
    </FormDialog>
  </div>
}

function CandidateCard({ student, selected, onSelect }: { student: StudentCandidateRow; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={selected ? 'verification-candidate selected' : 'verification-candidate'} onClick={onSelect}><span>{selected ? <CheckCircle2 size={18} /> : <UserRound size={18} />}</span><div><strong>{student.full_name}</strong><small>{student.nis ? `NIS ${student.nis}` : student.nisn ? `NISN ${student.nisn}` : 'NIS/NISN belum diisi'} · {student.class_name || 'Belum ada kelas'}</small><p>{student.birth_place || 'Tempat lahir belum diisi'}{student.birth_date ? `, ${student.birth_date}` : ''}</p></div></button>
}

function displayValue(key: string, value: string | null | undefined) {
  if (!value) return '—'
  if (key === 'gender') return value === 'L' ? 'Laki-laki' : value === 'P' ? 'Perempuan' : value
  return value
}
