import type { ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  helper?: string
  error?: string
  required?: boolean
  full?: boolean
}

export function FormField({ label, children, helper, error, required = false, full = false }: Props) {
  return (
    <label className={`form-field${full ? ' full' : ''}${error ? ' has-error' : ''}`}>
      <span className="form-field__label">{label}{required ? <b aria-hidden="true"> *</b> : null}</span>
      {children}
      {error ? <small className="form-field__error" role="alert">{error}</small> : helper ? <small className="form-field__helper">{helper}</small> : null}
    </label>
  )
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      {description ? <p>{description}</p> : null}
      <div className="form-section__grid">{children}</div>
    </fieldset>
  )
}
