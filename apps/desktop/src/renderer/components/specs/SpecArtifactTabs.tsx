import { useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import type { SpecArtifactKind, SpecChangeDetail } from '../../../../../../packages/shared/src'
import { specArtifactQueryOptions } from '../../queries'
import { MarkdownMessage } from '../chat/MarkdownMessage'
import { FeedbackText, Tabs } from '../ui'

type ArtifactTab = 'proposal' | 'design' | 'tasks' | 'delta_spec' | 'evidence'

const artifactTabLabels: Record<ArtifactTab, string> = {
  proposal: 'Proposal',
  design: 'Design',
  tasks: 'Tasks',
  delta_spec: 'Delta Specs',
  evidence: 'Evidence',
}

export function SpecArtifactTabs({ change }: { change: SpecChangeDetail | null }) {
  const [selectedTab, setSelectedTab] = useState<ArtifactTab>('proposal')

  if (!change) {
    return (
      <section className="spec-workbench-column spec-workbench-artifacts" aria-label="Spec artifacts">
        <FeedbackText>Select a spec change to inspect its artifacts.</FeedbackText>
      </section>
    )
  }

  const tabs = (Object.keys(artifactTabLabels) as ArtifactTab[]).map((artifactKind) => ({
    value: artifactKind,
    label: artifactTabLabels[artifactKind],
    panel: <SpecArtifactPanel change={change} artifactKind={artifactKind} />,
  }))

  return (
    <section className="spec-workbench-column spec-workbench-artifacts" aria-label="Spec artifacts">
      <div className="spec-workbench-column-header">
        <p className="eyebrow">Artifacts</p>
        <h2>{change.summary.title}</h2>
      </div>
      <Tabs
        ariaLabel="Spec artifact tabs"
        tabs={tabs}
        value={selectedTab}
        onValueChange={setSelectedTab}
      />
    </section>
  )
}

function SpecArtifactPanel({ change, artifactKind }: { change: SpecChangeDetail; artifactKind: ArtifactTab }) {
  const artifactPath = getArtifactPath(change, artifactKind)
  const relativePath = artifactKind === 'delta_spec' && artifactPath
    ? artifactPath.split('/specs/').at(1)
    : undefined
  const artifactQuery = useQuery(specArtifactQueryOptions({
    changeId: change.summary.id,
    artifactKind: artifactKind as SpecArtifactKind,
    relativePath,
    enabled: artifactKind === 'evidence' || Boolean(artifactPath),
  }))

  if (artifactKind !== 'evidence' && !artifactPath) {
    return <FeedbackText>No {artifactTabLabels[artifactKind].toLowerCase()} artifact found for this change.</FeedbackText>
  }

  if (artifactQuery.isLoading) {
    return <FeedbackText>Loading {artifactTabLabels[artifactKind].toLowerCase()}...</FeedbackText>
  }

  if (artifactQuery.isError) {
    return (
      <FeedbackText variant="error" live>
        Failed to load {artifactTabLabels[artifactKind].toLowerCase()}.
      </FeedbackText>
    )
  }

  if (artifactKind === 'evidence') {
    return (
      <pre className="spec-artifact-pre" aria-label="Spec evidence JSON">
        {artifactQuery.data?.content ?? JSON.stringify(change.evidenceLinks, null, 2)}
      </pre>
    )
  }

  return (
    <div className="spec-artifact-preview">
      {artifactQuery.data?.path ? <p className="spec-artifact-path">{artifactQuery.data.path}</p> : null}
      <MarkdownMessage content={artifactQuery.data?.content ?? ''} />
    </div>
  )
}

function getArtifactPath(change: SpecChangeDetail, artifactKind: ArtifactTab): string | null {
  return change.artifactPaths.find((artifact) => artifact.kind === artifactKind)?.path ?? null
}
