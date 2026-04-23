import { z } from 'zod'

export const desktopPlatformSchema = z.enum(['darwin', 'linux', 'win32'])

export type DesktopPlatform = z.infer<typeof desktopPlatformSchema>

export const desktopContextSchema = z.object({
  platform: desktopPlatformSchema,
})

export type DesktopContext = z.infer<typeof desktopContextSchema>
