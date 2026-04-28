import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from './classnames'

const feedbackClassName = {
  error: 'error-copy',
  muted: 'muted-copy',
  success: 'success-copy',
  warning: 'warning-copy',
} as const

export function FeedbackText({
  children,
  className,
  live,
  variant = 'muted',
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode
  live?: boolean
  variant?: keyof typeof feedbackClassName
}) {
  return (
    <p className={cn(feedbackClassName[variant], className)} aria-live={live ? 'polite' : undefined} {...props}>
      {children}
    </p>
  )
}
