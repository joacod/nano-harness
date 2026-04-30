import type { ReactNode } from 'react'

import { Field, FieldError, FieldHint, TextInput } from './ui'

export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return <Field label={label}>{children}</Field>
}

export function TextField({
  field,
  name,
  placeholder,
  autoComplete,
  inputType,
  readOnly,
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
  readOnly?: boolean
  spellCheck?: boolean
}) {
  const firstError = field.state.meta.errors[0]

  return (
    <>
      <TextInput
        name={name}
        type={inputType ?? 'text'}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        value={field.state.value ?? ''}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
      />
      {typeof firstError === 'string' ? <FieldError>{firstError}</FieldError> : null}
    </>
  )
}

export { FieldHint }
