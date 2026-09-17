import type { ReactNode } from 'react'

type MobileDataField = {
  label: string
  value: ReactNode
}

type MobileDataCardProps = {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  badges?: ReactNode
  fields?: MobileDataField[]
  actions?: ReactNode
  className?: string
}

export function MobileDataCard({ title, subtitle, leading, badges, fields = [], actions, className = '' }: MobileDataCardProps) {
  return (
    <article className={['mobile-data-card', className].filter(Boolean).join(' ')}>
      <div className="mobile-data-card__header">
        {leading ? <div className="mobile-data-card__leading" aria-hidden="true">{leading}</div> : null}
        <div className="mobile-data-card__title">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
          {badges ? <div className="mobile-data-card__badges">{badges}</div> : null}
        </div>
        {actions ? <div className="mobile-data-card__actions">{actions}</div> : null}
      </div>
      {fields.length ? (
        <dl className="mobile-data-card__fields">
          {fields.map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  )
}
