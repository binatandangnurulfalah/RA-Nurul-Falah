import { useId } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

type FormDialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  submitLabel?: string
  cancelLabel?: string
  busy?: boolean
  error?: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function FormDialog({ open, title, description, children, submitLabel = 'Simpan', cancelLabel = 'Batal', busy = false, error, onSubmit, onClose }: FormDialogProps) {
  const formId = useId()

  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={busy ? () => undefined : onClose}
      actions={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button type="submit" form={formId} disabled={busy}>{busy ? 'Menyimpan...' : submitLabel}</Button>
        </>
      )}
    >
      <form id={formId} className="form-dialog__form" onSubmit={onSubmit}>
        {children}
        {error ? <p className="form-dialog__error" role="alert">{error}</p> : null}
      </form>
    </Dialog>
  )
}
