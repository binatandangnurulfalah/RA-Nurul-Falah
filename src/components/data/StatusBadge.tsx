import type { ReactNode } from 'react'
import { Badge, type BadgeTone } from '../ui/Badge'

type StatusBadgeProps = {
  children: ReactNode
  tone?: BadgeTone
  icon?: ReactNode
  className?: string
}

export function StatusBadge({ children, tone = 'neutral', icon, className = '' }: StatusBadgeProps) {
  return (
    <Badge tone={tone} className={['status-badge', className].filter(Boolean).join(' ')}>
      {icon ? <span className="status-badge__icon" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </Badge>
  )
}
