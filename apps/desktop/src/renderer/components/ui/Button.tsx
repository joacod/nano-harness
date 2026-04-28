import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './classnames'

type ButtonVariant = 'primary' | 'ghost'

export function Button({
  children,
  className,
  variant = 'ghost',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
}) {
  return (
    <button className={cn(variant === 'primary' ? 'primary-button' : 'ghost-button', className)} {...props}>
      {children}
    </button>
  )
}
