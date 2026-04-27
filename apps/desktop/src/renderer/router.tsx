import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { RootLayout } from './components/RootLayout'
import { ConversationRoute } from './routes/ConversationRoute'
import { HomeRoute } from './routes/HomeRoute'
import { SettingsRoute } from './routes/SettingsRoute'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRoute,
})

const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conversations/$conversationId',
  component: ConversationRoute,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute,
})

const routeTree = rootRoute.addChildren([homeRoute, conversationRoute, settingsRoute])

export const router = createRouter({
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
