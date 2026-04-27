import type { RunStatus } from '@nano-harness/shared'

export function assertStatusTransition(current: RunStatus, next: RunStatus): void {
  if (current === next) {
    return
  }

  const transitions: Record<RunStatus, readonly RunStatus[]> = {
    created: ['started', 'cancelled'],
    started: ['waiting_approval', 'completed', 'failed', 'cancelled'],
    waiting_approval: ['started', 'completed', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: [],
  }

  if (!transitions[current].includes(next)) {
    throw new Error(`Invalid run status transition from ${current} to ${next}`)
  }
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
