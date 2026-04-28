import { useEffect, useState } from 'react'

import { Button, cn } from '../ui'
import type { ReasoningDisplay } from './reasoning'

export function ThinkingPanel({ display, defaultOpen }: { display: ReasoningDisplay; defaultOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  useEffect(() => {
    setIsOpen(defaultOpen)
  }, [defaultOpen])

  return (
    <section
      className={cn('thinking-panel', isOpen && 'thinking-panel-open')}
      onClick={() => {
        if (isOpen) {
          setIsOpen(false)
        }
      }}
    >
      <Button
        type="button"
        size="sm"
        fullWidth
        className="thinking-summary"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((current) => !current)
        }}
      >
        <span>Thinking</span>
        <span className="thinking-count">{isOpen ? 'hide details' : 'view details'}</span>
      </Button>
      {isOpen ? (
        <div className="thinking-body">
          {display.summaries.map((summary, index) => (
            <p key={`${summary}-${index}`}>{summary}</p>
          ))}
          {display.text ? <pre>{display.text}</pre> : null}
        </div>
      ) : null}
    </section>
  )
}
