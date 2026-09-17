import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="empty-state" aria-live="polite">
      {icon && <span className="empty-state__icon" aria-hidden="true">{icon}</span>}
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action && <div className="empty-state__action">{action}</div>}
    </section>
  )
}
