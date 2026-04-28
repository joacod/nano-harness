import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from './classnames'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariantClassName: Record<ButtonVariant, string> = {
  primary: 'primary-button',
  secondary: 'ghost-button',
}

export function Button({
  children,
  className,
  fullWidth = false,
  leadingIcon,
  size = 'md',
  trailingIcon,
  variant = 'secondary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  fullWidth?: boolean
  leadingIcon?: ReactNode
  size?: ButtonSize
  trailingIcon?: ReactNode
  variant?: ButtonVariant
}) {
  return (
    <button
      className={cn(
        buttonVariantClassName[variant],
        size !== 'md' && `button-${size}`,
        fullWidth && 'button-full-width',
        className,
      )}
      {...props}
    >
      {leadingIcon ? <span className="button-icon" aria-hidden="true">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="button-icon" aria-hidden="true">{trailingIcon}</span> : null}
    </button>
  )
}
