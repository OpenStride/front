import type { Component } from 'vue'
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
  /**
   * The plugin's configuration screen, loaded on demand.
   *
   * Typed as a `Component` rather than `unknown`: every caller assigned the
   * result straight into a `shallowRef<Component>` and had to be trusted to be
   * right, which `tsc` never checked because those callers are all `.vue`.
   */
  setupComponent: () => Promise<Component>
  refreshData?: () => Promise<unknown>
  /** If provided, the plugin is only visible when this returns true (e.g. native-only plugins). */
  available?: () => boolean
  context?: PluginContext
}
