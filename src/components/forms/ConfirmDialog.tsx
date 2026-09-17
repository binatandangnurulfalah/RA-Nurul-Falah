import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Konfirmasi', cancelLabel = 'Batal', busy = false, danger = false, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={busy ? () => undefined : onClose}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Memproses...' : confirmLabel}</Button>
        </>
      )}
    >
      <div className={danger ? 'confirm-dialog__content danger' : 'confirm-dialog__content'}>
        <span aria-hidden="true"><AlertTriangle size={24} /></span>
        <p>Pastikan data dan tindakan yang dipilih sudah benar sebelum melanjutkan.</p>
      </div>
    </Dialog>
  )
}
