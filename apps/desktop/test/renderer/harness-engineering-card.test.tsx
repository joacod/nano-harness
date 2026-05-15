// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HarnessEngineeringCard } from '../../src/renderer/components/settings/HarnessEngineeringCard'

describe('HarnessEngineeringCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows editable components and tracked benchmark cases', () => {
    render(<HarnessEngineeringCard />)

    expect(screen.getByText('Editable component registry')).toBeTruthy()
    expect(screen.getByText('Tracked benchmark cases')).toBeTruthy()
    expect(screen.getByText('Spec Workbench')).toBeTruthy()
    expect(screen.getByText('benchmarks/cases/spec-workbench.md')).toBeTruthy()
    expect(screen.getByText(/create_benchmark_run_artifact/u)).toBeTruthy()
  })
})
