import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import type { SpecChangeDetail } from '../../../../../../packages/shared/src'
import { settingsQueryOptions } from '../../queries'
import { Button, Card, FeedbackText } from '../ui'
import { SpecArtifactTabs } from './SpecArtifactTabs'
import { SpecChangesList, type SpecFilter } from './SpecChangesList'
import { SpecWorkflowPanel } from './SpecWorkflowPanel'

export function SpecWorkbench({
  changes,
  initialChangeId,
  onSelectChange,
}: {
  changes: SpecChangeDetail[]
  initialChangeId: string | null
  onSelectChange: (changeId: string) => void
}) {
  const settingsQuery = useQuery(settingsQueryOptions)
  const [filter, setFilter] = useState<SpecFilter>('active')
  const selectedChange = useMemo(() => {
    return changes.find((change) => change.summary.id === initialChangeId) ?? getDefaultChange(changes) ?? null
  }, [changes, initialChangeId])

  useEffect(() => {
    if (!initialChangeId && selectedChange) {
      onSelectChange(selectedChange.summary.id)
    }
  }, [initialChangeId, onSelectChange, selectedChange])

  if (changes.length === 0) {
    const specsPath = settingsQuery.data ? `${settingsQuery.data.workspace.rootPath}/.nano/specs` : null

    return (
      <Card hero>
        <p className="eyebrow">Specs</p>
        <h2>No spec changes yet.</h2>
        <FeedbackText>
          Use the Spec chat button when a task needs a durable proposal, design, tasks, validation, and evidence before build work starts.
        </FeedbackText>
        <div className="spec-empty-actions">
          <Button
            type="button"
            disabled={!specsPath}
            onClick={() => {
              if (specsPath) {
                void window.desktop.showItemInFolder({ filePath: specsPath })
              }
            }}
          >
            Open .nano/specs folder
          </Button>
        </div>
        <FeedbackText>
          How Specs work: chat creates an approval-gated change folder, the Workbench shows the artifacts, and each run links back evidence as it plans, builds, verifies, or archives the change.
        </FeedbackText>
      </Card>
    )
  }

  return (
    <div className="spec-workbench-grid">
      <SpecChangesList
        changes={changes}
        filter={filter}
        selectedChangeId={selectedChange?.summary.id ?? null}
        onFilterChange={setFilter}
        onSelectChange={onSelectChange}
      />
      <SpecArtifactTabs change={selectedChange} />
      <SpecWorkflowPanel change={selectedChange} />
    </div>
  )
}

function getDefaultChange(changes: SpecChangeDetail[]): SpecChangeDetail | null {
  return changes.find((change) => change.summary.status !== 'archived' && change.summary.status !== 'verified') ?? changes[0] ?? null
}
