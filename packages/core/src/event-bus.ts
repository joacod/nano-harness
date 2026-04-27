import type { RunEvent } from '@nano-harness/shared'

export interface EventBus {
  publish(event: RunEvent): Promise<void> | void
}

export const noopEventBus: EventBus = {
  publish() {},
}

export class InMemoryEventBus implements EventBus {
  private readonly listeners = new Set<(event: RunEvent) => Promise<void> | void>()

  subscribe(listener: (event: RunEvent) => Promise<void> | void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  async publish(event: RunEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event)
    }
  }
}
