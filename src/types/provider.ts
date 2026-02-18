import type { PluginContext } from './plugin-context'

export interface ProviderPlugin {
  id: string
  label: string
  icon?: string
  description?: string
  setupComponent: () => Promise<any>
  refreshData?: () => Promise<any>
  /** If provided, plugin is only visible when this returns true (e.g. native-only plugins) */
  available?: () => boolean
  context?: PluginContext
}
