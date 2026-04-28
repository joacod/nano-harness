import { forwardRef, type ComponentPropsWithoutRef } from 'react'

import { cn } from './classnames'

type CardProps = {
  className?: string
  hero?: boolean
} & ComponentPropsWithoutRef<'section'>

export const Card = forwardRef<HTMLElement, CardProps>(function Card({
  className,
  hero = false,
  ...props
}, ref) {
  return <section ref={ref} className={cn('panel-card', hero && 'panel-card-hero', className)} {...props} />
})
