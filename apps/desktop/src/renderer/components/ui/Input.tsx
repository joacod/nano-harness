import { Children, isValidElement, useId, useRef, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react'

import { cn } from './classnames'

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('text-input', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('text-input', className)} {...props} />
}

type OptionElement = ReactElement<{
  value: string
  children: ReactNode
}>

type SelectChangeEvent = {
  target: {
    value: string
  }
}

type SelectProps = {
  name: string
  value: string
  children: ReactNode
  className?: string
  onChange: (event: SelectChangeEvent) => void
}

function getSelectOptions(children: ReactNode) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) {
      return []
    }

    const option = child as OptionElement
    return [{ value: option.props.value, label: option.props.children }]
  })
}

export function Select({ name, value, children, className, onChange }: SelectProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const options = getSelectOptions(children)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedOption?.value))

  function selectValue(nextValue: string) {
    onChange({ target: { value: nextValue } })
    setIsOpen(false)
  }

  function selectByOffset(offset: number) {
    if (options.length === 0) {
      return
    }

    const nextIndex = (selectedIndex + offset + options.length) % options.length
    selectValue(options[nextIndex].value)
  }

  return (
    <div
      ref={rootRef}
      className={cn('custom-select', className)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) {
          setIsOpen(false)
        }
      }}
    >
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="custom-select-trigger"
        data-select-trigger={name}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!isOpen) {
              setIsOpen(true)
              return
            }

            selectByOffset(1)
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!isOpen) {
              setIsOpen(true)
              return
            }

            selectByOffset(-1)
          }

          if (event.key === 'Escape') {
            setIsOpen(false)
          }
        }}
      >
        <span className="custom-select-value">{selectedOption?.label ?? 'Select'}</span>
        <span className="custom-select-chevron" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div id={`${id}-listbox`} className="custom-select-options" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn('custom-select-option', option.value === value && 'custom-select-option-active')}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectValue(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
