import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from './classnames'

export function StatusBadge({ children, className, status, ...props }: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  status?: string
}) {
  return (
    <span className={cn('status-badge', status ? `status-${status}` : null, className)} {...props}>
      {children}
    </span>
  )
}

export function RuntimePill({ children, className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: 'ready' | 'warning'
}) {
  return (
    <span className={cn('runtime-pill', tone === 'ready' && 'runtime-pill-ready', tone === 'warning' && 'runtime-pill-warning', className)} {...props}>
      {children}
    </span>
  )
}
