import { useEffect, type ReactNode } from 'react'

import { cn } from './classnames'

export type ToastMessage = {
  id: string
  message?: ReactNode
  title: ReactNode
  variant?: 'error' | 'success'
}

export function Toast({
  autoDismissMs = 6000,
  onDismiss,
  toast,
}: {
  autoDismissMs?: number
  onDismiss: () => void
  toast: ToastMessage | null
}) {
  useEffect(() => {
    if (!toast || autoDismissMs <= 0) {
      return undefined
    }

    const timeoutId = window.setTimeout(onDismiss, autoDismissMs)

    return () => window.clearTimeout(timeoutId)
  }, [autoDismissMs, onDismiss, toast])

  if (!toast) {
    return null
  }

  const variant = toast.variant ?? 'success'

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      <section className={cn('toast-card', `toast-card-${variant}`)} role={variant === 'error' ? 'alert' : 'status'}>
        <div className="toast-content">
          <strong>{toast.title}</strong>
          {toast.message ? <p>{toast.message}</p> : null}
        </div>
        <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={onDismiss}>
          ×
        </button>
      </section>
    </div>
  )
}
