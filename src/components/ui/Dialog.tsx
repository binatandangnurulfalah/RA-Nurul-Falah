import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

type DialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
  closeLabel?: string
  onClose: () => void
}

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, title, description, children, actions, closeLabel = 'Tutup dialog', onClose }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusFirst = () => {
      const first = dialog?.querySelector<HTMLElement>(focusableSelector)
      ;(first ?? dialog)?.focus()
    }
    focusFirst()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const items = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((item) => item.offsetParent !== null)
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousActive?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="ds-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div
        ref={dialogRef}
        className="ds-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="ds-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <button className="ds-dialog__close" type="button" aria-label={closeLabel} onClick={onClose}>×</button>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </header>
        <div className="ds-dialog__body">{children}</div>
        {actions ? <footer className="ds-dialog__actions">{actions}</footer> : null}
      </div>
    </div>
  )
}
