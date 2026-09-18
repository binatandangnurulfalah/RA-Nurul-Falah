import { useId, useRef } from 'react'
import { useDialogFocus } from './useDialogFocus'
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

export function Dialog({ open, title, description, children, actions, closeLabel = 'Tutup dialog', onClose }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useDialogFocus({
    active: open,
    containerRef: dialogRef,
    onClose,
    lockBodyScroll: true,
  })

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
