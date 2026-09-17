import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header__copy">
        {eyebrow ? <p className="ds-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="ds-page-header__title">{title}</h1>
        {subtitle ? <p className="ds-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ds-page-header__actions">{actions}</div> : null}
    </header>
  )
}
