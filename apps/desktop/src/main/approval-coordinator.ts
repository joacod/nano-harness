import type { ApprovalCoordinator } from '../../../../packages/core/src'

export class DesktopApprovalCoordinator implements ApprovalCoordinator {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (resolution: { approvalRequestId: string; decision: 'granted' | 'rejected'; decidedAt: string }) => void
    }
  >()

  async waitForDecision(input: Parameters<ApprovalCoordinator['waitForDecision']>[0]) {
    return await new Promise<{ approvalRequestId: string; decision: 'granted' | 'rejected'; decidedAt: string }>(
      (resolve, reject) => {
        const onAbort = () => {
          this.pendingRequests.delete(input.request.id)
          const error = new Error('Approval wait aborted')
          error.name = 'AbortError'
          reject(error)
        }

        if (input.signal.aborted) {
          onAbort()
          return
        }

        this.pendingRequests.set(input.request.id, {
          resolve: (resolution) => {
            input.signal.removeEventListener('abort', onAbort)
            this.pendingRequests.delete(input.request.id)
            resolve(resolution)
          },
        })

        input.signal.addEventListener('abort', onAbort, { once: true })
      },
    )
  }

  async resolveDecision(input: { approvalRequestId: string; decision: 'granted' | 'rejected' }): Promise<boolean> {
    const pendingRequest = this.pendingRequests.get(input.approvalRequestId)

    if (!pendingRequest) {
      return false
    }

    pendingRequest.resolve({
      approvalRequestId: input.approvalRequestId,
      decision: input.decision,
      decidedAt: new Date().toISOString(),
    })

    return true
  }
}
