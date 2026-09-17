import type { ReactNode } from 'react'

export type StatCardTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger' | 'purple'

type StatCardProps = {
  label: string
  value: ReactNode
  icon?: ReactNode
  supportingText?: ReactNode
  tone?: StatCardTone
  className?: string
}

export function StatCard({ label, value, icon, supportingText, tone = 'neutral', className = '' }: StatCardProps) {
  const classes = ['data-stat-card', `data-stat-card--${tone}`, className].filter(Boolean).join(' ')

  return (
    <article className={classes}>
      {icon ? <span className="data-stat-card__icon" aria-hidden="true">{icon}</span> : null}
      <div className="data-stat-card__content">
        <small>{label}</small>
        <strong>{value}</strong>
        {supportingText ? <p>{supportingText}</p> : null}
      </div>
    </article>
  )
}
