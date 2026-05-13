import { useEffect, useId, useRef, useState } from 'react'

import { Button } from './ui'

export function SessionActionsMenu({
  isPending,
  onCloneSession,
  onExportSession,
  onForkSession,
}: {
  isPending?: boolean
  onCloneSession?: () => void
  onExportSession?: () => void
  onForkSession?: () => void
}) {
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }

      setIsOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function runAction(action?: () => void) {
    if (!action || isPending) {
      return
    }

    setIsOpen(false)
    action()
  }

  return (
    <div className="session-actions-menu" ref={menuRef}>
      <Button
        type="button"
        size="sm"
        className="session-actions-trigger"
        aria-label="Session options"
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="session-actions-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </Button>
      {isOpen ? (
        <div className="session-actions-list" id={menuId} role="menu" aria-label="Session options">
          <button type="button" role="menuitem" disabled={isPending || !onForkSession} onClick={() => runAction(onForkSession)}>Fork</button>
          <button type="button" role="menuitem" disabled={isPending || !onCloneSession} onClick={() => runAction(onCloneSession)}>Clone</button>
          <button type="button" role="menuitem" disabled={isPending || !onExportSession} onClick={() => runAction(onExportSession)}>Export session</button>
        </div>
      ) : null}
    </div>
  )
}
