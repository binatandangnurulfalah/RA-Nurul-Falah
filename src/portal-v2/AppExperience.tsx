import { createContext, type ReactNode, useContext, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, WifiOff, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export type LinkedChild = { id: string; full_name: string; class_name: string | null; academic_year: string | null; nis?: string | null; qr_token?: string }

type ChildContextValue = {
  children: LinkedChild[]
  selectedChildId: string
  setSelectedChildId: (id: string) => void
  loading: boolean
  error: string
  retry: () => void
}

const ChildContext = createContext<ChildContextValue>({ children: [], selectedChildId: '', setSelectedChildId: () => undefined, loading: false, error: '', retry: () => undefined })

export function ChildSelectionProvider({ enabled, children: content }: { enabled: boolean; children: ReactNode }) {
  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>([])
  const [selectedChildId, setSelectedChildIdState] = useState(() => localStorage.getItem('ra_selected_child') || '')
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let active = true
    setLoading(true); setError('')
    void supabase.from('students').select('id,full_name,nis,class_name,academic_year,qr_token').eq('is_active', true).order('full_name').then(({ data, error: queryError }) => {
      if (!active) return
      if (queryError) { setError('Data anak gagal dimuat. Periksa koneksi lalu coba lagi.'); setLoading(false); return }
      const list = (data as LinkedChild[] | null) ?? []
      setLinkedChildren(list)
      setSelectedChildIdState((current) => list.some((item) => item.id === current) ? current : list[0]?.id || '')
      setLoading(false)
    })
    return () => { active = false }
  }, [enabled, reloadKey])

  const setSelectedChildId = (id: string) => { setSelectedChildIdState(id); localStorage.setItem('ra_selected_child', id) }
  return <ChildContext.Provider value={{ children: linkedChildren, selectedChildId, setSelectedChildId, loading, error, retry: () => setReloadKey((value) => value + 1) }}>{content}</ChildContext.Provider>
}

export function useChildSelection() { return useContext(ChildContext) }

export function GlobalChildSwitcher() {
  const { children, selectedChildId, setSelectedChildId, loading } = useChildSelection()
  if (loading || children.length < 2) return null
  return <div className="v5-global-child"><label htmlFor="global-child-select">Data anak</label><select id="global-child-select" value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)}>{children.map((child) => <option value={child.id} key={child.id}>{child.full_name}{child.class_name ? ` · ${child.class_name}` : ''}</option>)}</select></div>
}

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [])
  return online ? null : <div className="v5-offline" role="status"><WifiOff size={17} /><span>Anda sedang offline. Data tidak dapat diperbarui sampai koneksi kembali.</span></div>
}

export function LoadError({ text = 'Data gagal dimuat.', onRetry }: { text?: string; onRetry: () => void }) {
  return <section className="v5-load-error" role="alert"><AlertTriangle size={24} /><div><strong>{text}</strong><p>Data lama tidak dihapus. Silakan periksa koneksi Anda.</p></div><button className="v2-secondary" onClick={onRetry}><RefreshCw size={16} /> Coba lagi</button></section>
}

export function Dialog({ title, eyebrow = 'RA NURUL FALAH', onClose, wide = false, confirm = false, children }: { title: string; eyebrow?: string; onClose: () => void; wide?: boolean; confirm?: boolean; children: ReactNode }) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement
    const panel = panelRef.current
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]') || [])
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const items = focusable(); if (!items.length) return
      const first = items[0]; const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); returnFocusRef.current?.focus() }
  }, [onClose])
  return <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup dialog" onClick={onClose} /><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`v2-modal ${wide ? 'wide' : ''} ${confirm ? 'confirm' : ''}`}><header><div><small>{eyebrow}</small><h2 id={titleId}>{title}</h2></div><button type="button" className="v2-close" aria-label="Tutup dialog" onClick={onClose}><X size={19} /></button></header>{children}</section></div>
}
