import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <section className="ds-empty-state" aria-label={title}>
      <div className="ds-empty-state__inner">
        {icon ? <div className="ds-empty-state__icon" aria-hidden="true">{icon}</div> : null}
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    </section>
  )
}
