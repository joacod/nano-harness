import { useId, type ReactNode } from 'react'

import { cn } from './classnames'

type TabItem<TValue extends string> = {
  value: TValue
  label: ReactNode
  panel: ReactNode
}

export function Tabs<TValue extends string>({
  ariaLabel,
  className,
  onValueChange,
  tabs,
  value,
}: {
  ariaLabel: string
  className?: string
  onValueChange: (value: TValue) => void
  tabs: TabItem<TValue>[]
  value: TValue
}) {
  const baseId = useId()
  const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.value === value))
  const selectedTab = tabs[selectedIndex]

  return (
    <div className={cn('tabs', className)}>
      <div className="tabs-list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => {
          const isSelected = tab.value === value
          const tabId = `${baseId}-${tab.value}-tab`
          const panelId = `${baseId}-${tab.value}-panel`

          return (
            <button
              key={tab.value}
              id={tabId}
              type="button"
              className={cn('tab-button', isSelected && 'tab-button-active')}
              role="tab"
              aria-controls={panelId}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onValueChange(tab.value)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
                  return
                }

                event.preventDefault()
                const nextIndex = getNextTabIndex(event.key, index, tabs.length)
                const nextTab = tabs[nextIndex]
                onValueChange(nextTab.value)
                document.getElementById(`${baseId}-${nextTab.value}-tab`)?.focus()
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {selectedTab ? (
        <div
          id={`${baseId}-${selectedTab.value}-panel`}
          className="tabs-panel"
          role="tabpanel"
          aria-labelledby={`${baseId}-${selectedTab.value}-tab`}
        >
          {selectedTab.panel}
        </div>
      ) : null}
    </div>
  )
}

function getNextTabIndex(key: string, currentIndex: number, count: number) {
  if (key === 'Home') {
    return 0
  }

  if (key === 'End') {
    return count - 1
  }

  if (key === 'ArrowLeft') {
    return currentIndex === 0 ? count - 1 : currentIndex - 1
  }

  return currentIndex === count - 1 ? 0 : currentIndex + 1
}
