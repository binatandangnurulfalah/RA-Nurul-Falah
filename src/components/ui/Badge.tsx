import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger' | 'purple'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  children: ReactNode
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  const classes = ['ds-badge', `ds-badge--${tone}`, className].filter(Boolean).join(' ')
  return <span className={classes} {...props}>{children}</span>
}
