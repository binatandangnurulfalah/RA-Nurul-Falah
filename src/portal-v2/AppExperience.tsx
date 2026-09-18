import { createContext, type ReactNode, useContext, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, EllipsisVertical, RefreshCw, X, type LucideIcon } from 'lucide-react'
import { useDialogFocus } from '../components/ui/useDialogFocus'
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

export function LoadError({ text = 'Data gagal dimuat.', onRetry }: { text?: string; onRetry: () => void }) {
  return <section className="v5-load-error" role="alert"><AlertTriangle size={24} /><div><strong>{text}</strong><p>Data lama tidak dihapus. Silakan periksa koneksi Anda.</p></div><button className="v2-secondary" onClick={onRetry}><RefreshCw size={16} /> Coba lagi</button></section>
}

export type ActionMenuItem = {
  label: string
  icon: LucideIcon
  onSelect?: () => void
  href?: string
  external?: boolean
  danger?: boolean
}

export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const closeKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeKey)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeKey) }
  }, [open])
  if (!items.length) return null
  return <div className="v5-action-menu" ref={rootRef}>
    <button type="button" className="v5-action-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><EllipsisVertical size={20} /></button>
    {open && <div className="v5-action-popover" role="menu">{items.map(({ label: itemLabel, icon: Icon, onSelect, href, external, danger }) => href
      ? <a key={itemLabel} role="menuitem" className={danger ? 'danger' : ''} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} onClick={() => setOpen(false)}><Icon size={17} /><span>{itemLabel}</span></a>
      : <button key={itemLabel} type="button" role="menuitem" className={danger ? 'danger' : ''} onClick={() => { setOpen(false); onSelect?.() }}><Icon size={17} /><span>{itemLabel}</span></button>
    )}</div>}
  </div>
}

export function Dialog({ title, eyebrow = 'RA NURUL FALAH', onClose, wide = false, confirm = false, children }: { title: string; eyebrow?: string; onClose: () => void; wide?: boolean; confirm?: boolean; children: ReactNode }) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)

  useDialogFocus({
    containerRef: panelRef,
    onClose,
  })

  return <div className="v2-modal-layer"><button className="v2-backdrop" aria-label="Tutup dialog" onClick={onClose} /><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`v2-modal ${wide ? 'wide' : ''} ${confirm ? 'confirm' : ''}`}><header><div><small>{eyebrow}</small><h2 id={titleId}>{title}</h2></div><button type="button" className="v2-close" aria-label="Tutup dialog" onClick={onClose}><X size={19} /></button></header>{children}</section></div>
}
