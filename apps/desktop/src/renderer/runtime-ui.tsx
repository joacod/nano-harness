import { createContext, startTransition, useContext, useEffect, useState } from 'react'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'

import type { DesktopContext, RunEvent } from '../../../../packages/shared/src'
import { contextQueryOptions } from './queries'
import { router } from './router'
import { updateLiveRunEvents, updateStreamingState, type StreamingRunState } from './utils/run-events'

type RuntimeUiState = {
  context: DesktopContext | null
  recentEvents: RunEvent[]
  liveRunEvents: Record<string, RunEvent[]>
  streamingRuns: Record<string, StreamingRunState>
}

const RuntimeUiContext = createContext<RuntimeUiState | null>(null)
const TechnicalUiContext = createContext<{
  isSidebarCollapsed: boolean
  showTechnicalInfo: boolean
  toggleSidebarCollapsed: () => void
  toggleTechnicalInfo: () => void
} | null>(null)

export function useRuntimeUi(): RuntimeUiState {
  const value = useContext(RuntimeUiContext)

  if (!value) {
    throw new Error('Runtime UI context is unavailable')
  }

  return value
}

export function useTechnicalUi() {
  const value = useContext(TechnicalUiContext)

  if (!value) {
    throw new Error('Technical UI context is unavailable')
  }

  return value
}

export function RuntimeUiProvider() {
  const queryClient = useQueryClient()
  const { data: context } = useQuery(contextQueryOptions)
  const [recentEvents, setRecentEvents] = useState<RunEvent[]>([])
  const [liveRunEvents, setLiveRunEvents] = useState<Record<string, RunEvent[]>>({})
  const [streamingRuns, setStreamingRuns] = useState<Record<string, StreamingRunState>>({})
  const [showTechnicalInfo, setShowTechnicalInfo] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)

  useEffect(() => {
    const unsubscribe = window.desktop.onRunEvent((event) => {
      startTransition(() => {
        setRecentEvents((currentEvents) => [event, ...currentEvents].slice(0, 20))
        setLiveRunEvents((currentEvents) => updateLiveRunEvents(currentEvents, event))
        setStreamingRuns((currentRuns) => updateStreamingState(currentRuns, event))
      })

      if (
        event.type === 'run.created' ||
        event.type === 'message.created' ||
        event.type.startsWith('approval.') ||
        event.type.startsWith('action.')
      ) {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] })
        void queryClient.invalidateQueries({ queryKey: ['conversation'] })
      }

      if (event.type.startsWith('run.')) {
        void queryClient.invalidateQueries({ queryKey: ['conversation'] })
      }
    })

    return unsubscribe
  }, [queryClient])

  return (
    <TechnicalUiContext.Provider
      value={{
        isSidebarCollapsed,
        showTechnicalInfo,
        toggleSidebarCollapsed: () => setIsSidebarCollapsed((current) => !current),
        toggleTechnicalInfo: () => setShowTechnicalInfo((current) => !current),
      }}
    >
      <RuntimeUiContext.Provider
        value={{
          context: context ?? null,
          recentEvents,
          liveRunEvents,
          streamingRuns,
        }}
      >
        <RouterProvider router={router} />
      </RuntimeUiContext.Provider>
    </TechnicalUiContext.Provider>
  )
}
