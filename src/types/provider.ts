import type { PluginContext } from './plugin-context'

export interface ProviderPlugin {
  id: string
  label: string
  icon?: string
  description?: string
  setupComponent: () => Promise<unknown>
  refreshData?: () => Promise<unknown>
  context?: PluginContext
}
