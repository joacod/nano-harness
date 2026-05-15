import type { SpecChangeDetail } from '../../../../../../packages/shared/src'
import { formatTimestamp } from '../../utils/formatting'
import { FeedbackText, StatusBadge } from '../ui'

type SpecFilter = 'active' | 'verified' | 'archived'

export function SpecChangesList({
  changes,
  filter,
  selectedChangeId,
  onFilterChange,
  onSelectChange,
}: {
  changes: SpecChangeDetail[]
  filter: SpecFilter
  selectedChangeId: string | null
  onFilterChange: (filter: SpecFilter) => void
  onSelectChange: (changeId: string) => void
}) {
  const filteredChanges = changes.filter((change) => {
    if (filter === 'archived') {
      return change.summary.status === 'archived'
    }

    if (filter === 'verified') {
      return change.summary.status === 'verified'
    }

    return change.summary.status !== 'archived' && change.summary.status !== 'verified'
  })

  return (
    <section className="spec-workbench-column spec-workbench-list" aria-label="Spec changes">
      <div className="spec-workbench-column-header">
        <p className="eyebrow">Active changes</p>
        <h2>Changes</h2>
      </div>
      <div className="spec-filter-row" role="group" aria-label="Spec change filter">
        {(['active', 'verified', 'archived'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`tab-button${filter === item ? ' tab-button-active' : ''}`}
            aria-pressed={filter === item}
            onClick={() => onFilterChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {filteredChanges.length === 0 ? (
        <FeedbackText>
          No {filter} spec changes yet.
        </FeedbackText>
      ) : null}
      <div className="spec-change-list">
        {filteredChanges.map((change) => {
          const isSelected = change.summary.id === selectedChangeId

          return (
            <button
              key={change.summary.id}
              type="button"
              className={`spec-change-card${isSelected ? ' spec-change-card-active' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onSelectChange(change.summary.id)}
            >
              <span className="spec-change-card-title">{change.summary.title}</span>
              <span className="spec-change-card-id">{change.summary.id}</span>
              <span className="spec-change-card-meta">
                <StatusBadge status={change.summary.status}>{change.summary.status}</StatusBadge>
                <span>{change.summary.taskCounts.done}/{change.summary.taskCounts.total} tasks</span>
              </span>
              <small>{formatTimestamp(change.summary.updatedAt)} · {change.summary.linkedRunIds.length} runs</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export type { SpecFilter }
