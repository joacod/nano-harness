import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'

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
  const [opensUp, setOpensUp] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null)
  const options = getSelectOptions(children)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedOption?.value))

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function closeSelect() {
      setIsOpen(false)
    }

    window.addEventListener('resize', closeSelect)
    window.addEventListener('scroll', closeSelect, true)

    return () => {
      window.removeEventListener('resize', closeSelect)
      window.removeEventListener('scroll', closeSelect, true)
    }
  }, [isOpen])

  function openSelect() {
    const root = rootRef.current
    const rect = root?.getBoundingClientRect()

    if (rect) {
      const menuHeight = Math.min(240, options.length * 42 + 12)
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const nextOpensUp = spaceBelow < menuHeight && spaceAbove > spaceBelow

      setOpensUp(nextOpensUp)
      setMenuPosition({
        left: rect.left,
        width: rect.width,
        ...(nextOpensUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      })
    }

    setIsOpen(true)
  }

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
        onClick={() => {
          if (isOpen) {
            setIsOpen(false)
            return
          }

          openSelect()
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!isOpen) {
              openSelect()
              return
            }

            selectByOffset(1)
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!isOpen) {
              openSelect()
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
      {isOpen && menuPosition ? createPortal(
        <div
          id={`${id}-listbox`}
          className="custom-select-options"
          role="listbox"
          style={menuPosition}
        >
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
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
