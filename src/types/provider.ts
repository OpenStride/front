import type { PluginContext } from './plugin-context'
import type { PluginPreferenceDeclaration } from './plugin-preferences'

export interface ProviderPlugin {
  id: string
  label: string
  icon?: string
  description?: string
  setupComponent: () => Promise<unknown>
  refreshData?: () => Promise<unknown>

  /**
   * Preferences this plugin declares. Their defaults are proposed once, when the
   * plugin is installed, and only for keys that hold no value yet.
   */
  preferences?: PluginPreferenceDeclaration[]
  context?: PluginContext
}
