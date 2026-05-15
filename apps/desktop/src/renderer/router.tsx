import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { RootLayout } from './components/RootLayout'
import { ConversationRoute } from './routes/ConversationRoute'
import { HomeRoute } from './routes/HomeRoute'
import { SettingsRoute } from './routes/SettingsRoute'
import { SpecsRoute } from './routes/SpecsRoute'

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

const specsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/specs',
  component: SpecsRoute,
})

const routeTree = rootRoute.addChildren([homeRoute, conversationRoute, settingsRoute, specsRoute])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
