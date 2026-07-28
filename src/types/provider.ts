import type { PluginContext } from './plugin-context'

export interface ProviderPlugin {
  id: string
  label: string
  icon?: string
  description?: string
  /**
   * Withdrawn from the lists that offer new connections, while staying
   * resolvable so anyone who already connected it keeps a working setup page
   * and their imported activities keep their provenance.
   */
  deprecated?: boolean
  setupComponent: () => Promise<unknown>
  refreshData?: () => Promise<unknown>
  context?: PluginContext
}
