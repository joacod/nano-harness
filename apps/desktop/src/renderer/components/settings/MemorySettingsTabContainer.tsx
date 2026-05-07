import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { memoryProposalsQueryOptions, memoryRecordsQueryOptions } from '../../queries'
import { MemoryInspectorCard } from './MemoryInspectorCard'

export function MemorySettingsTabContainer() {
  const queryClient = useQueryClient()
  const memoryRecordsQuery = useQuery(memoryRecordsQueryOptions)
  const memoryProposalsQuery = useQuery(memoryProposalsQueryOptions)
  const resolveMemoryProposalMutation = useMutation({
    mutationFn: async (input: { proposalId: string; decision: 'approved' | 'rejected' }) => window.desktop.resolveMemoryProposal(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memoryRecordsQueryOptions.queryKey })
      await queryClient.invalidateQueries({ queryKey: memoryProposalsQueryOptions.queryKey })
    },
  })

  return (
    <MemoryInspectorCard
      records={memoryRecordsQuery.data ?? null}
      proposals={memoryProposalsQuery.data ?? null}
      isResolving={resolveMemoryProposalMutation.isPending}
      error={resolveMemoryProposalMutation.error instanceof Error ? resolveMemoryProposalMutation.error.message : null}
      onResolveProposal={async (input) => {
        await resolveMemoryProposalMutation.mutateAsync(input)
      }}
    />
  )
}
