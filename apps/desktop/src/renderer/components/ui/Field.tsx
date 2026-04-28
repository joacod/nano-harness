import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <span className="field-hint">{children}</span>
}

export function FieldError({ children }: { children: ReactNode }) {
  return <span className="field-error">{children}</span>
}
