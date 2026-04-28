import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './classnames'

export function Switch({
  checked,
  children,
  className,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked'> & {
  checked: boolean
  children: ReactNode
}) {
  return (
    <button className={cn('switch-button', checked && 'switch-button-active', className)} role="switch" aria-checked={checked} {...props}>
      <span>{children}</span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  )
}
