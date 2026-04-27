import type { ReactNode } from 'react'

export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
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

export function TextField({
  field,
  name,
  placeholder,
  autoComplete,
  inputType,
  spellCheck,
}: {
  field: {
    state: {
      value: string | undefined
      meta: {
        errors: unknown[]
      }
    }
    handleBlur: () => void
    handleChange: (value: string) => void
  }
  name: string
  placeholder: string
  autoComplete?: string
  inputType?: 'password' | 'text'
  spellCheck?: boolean
}) {
  const firstError = field.state.meta.errors[0]

  return (
    <>
      <input
        className="text-input"
        name={name}
        type={inputType ?? 'text'}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
      />
      {typeof firstError === 'string' ? <span className="field-error">{firstError}</span> : null}
    </>
  )
}
