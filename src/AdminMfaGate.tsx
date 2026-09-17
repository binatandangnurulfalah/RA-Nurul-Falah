import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { supabase } from './lib/supabase'

type GateState = 'loading' | 'enroll' | 'challenge' | 'ready' | 'error'

export default function AdminMfaGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('loading')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')

  useEffect(() => {
    let mounted = true

    const initialize = async () => {
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!mounted) return
      if (assuranceError) {
        setErrorText('Status keamanan akun tidak dapat diperiksa.')
        setState('error')
        return
      }
      if (assurance.currentLevel === 'aal2') {
        setState('ready')
        return
      }

      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors()
      if (!mounted) return
      if (factorError) {
        setErrorText('Faktor keamanan akun tidak dapat diperiksa.')
        setState('error')
        return
      }

      const verifiedTotp = factors.totp.find((factor) => factor.status === 'verified')
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id)
        setState('challenge')
        return
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'RA Nurul Falah Admin',
      })
      if (!mounted) return
      if (enrollError) {
        setErrorText('MFA administrator belum dapat disiapkan. Muat ulang lalu coba lagi.')
        setState('error')
        return
      }

      setFactorId(enrolled.id)
      setQrCode(enrolled.totp.qr_code)
      setSecret(enrolled.totp.secret)
      setState('enroll')
    }

    void initialize()
    return () => { mounted = false }
  }, [])

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (!factorId || code.length !== 6) return
    setBusy(true)
    setErrorText('')

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) {
      setErrorText('Kode autentikator tidak valid atau sudah kedaluwarsa.')
      setBusy(false)
      return
    }

    setBusy(false)
    setState('ready')
  }

  if (state === 'ready') return <>{children}</>
  if (state === 'loading') return <div className="centered-message">Memeriksa keamanan administrator...</div>

  return (
    <div className="auth-page">
      <section className="brand-panel">
        <img className="auth-brand-logo" src={`${import.meta.env.BASE_URL}logo-ra-nurul-falah.png`} alt="Logo RA Nurul Falah" />
        <div>
          <p className="eyebrow">Keamanan Administrator</p>
          <h1>Verifikasi dua langkah</h1>
          <p>Akses administrator dilindungi autentikasi dua faktor (MFA).</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <ShieldCheck size={30} aria-hidden="true" />
          <h2>{state === 'enroll' ? 'Aktifkan MFA' : state === 'challenge' ? 'Verifikasi MFA' : 'MFA tidak tersedia'}</h2>
          {state === 'enroll' && <>
            <p className="subtitle">Pindai QR berikut dengan aplikasi authenticator, lalu masukkan kode 6 digit.</p>
            {qrCode && <img src={qrCode} alt="QR untuk mengaktifkan MFA administrator" width="200" height="200" />}
            {secret && <p className="helper-text">Tidak bisa memindai? Masukkan secret ini secara manual: <strong>{secret}</strong></p>}
          </>}
          {state === 'challenge' && <p className="subtitle">Masukkan kode 6 digit dari aplikasi authenticator Anda.</p>}
          {state !== 'error' ? <form className="form-stack" onSubmit={verify}>
            <label className="field-wrap">
              <span className="field-label">Kode authenticator</span>
              <span className="input-wrap">
                <KeyRound size={18} aria-hidden="true" />
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                />
              </span>
            </label>
            {errorText && <div className="alert error" role="alert">{errorText}</div>}
            <button className="primary-button" disabled={busy || code.length !== 6}>
              {busy ? 'Memverifikasi...' : state === 'enroll' ? 'Aktifkan dan Masuk' : 'Verifikasi dan Masuk'}
            </button>
          </form> : <>
            <div className="alert error" role="alert">{errorText}</div>
            <button className="primary-button" onClick={() => window.location.reload()}>Muat Ulang</button>
          </>}
          <p className="helper-text">Simpan faktor cadangan pada perangkat authenticator kedua. Aplikasi tidak menyimpan kode MFA atau password Anda.</p>
        </div>
      </section>
    </div>
  )
}
