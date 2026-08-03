// services/AppExtensionPluginManager.ts
import { allAppPlugins } from '@/services/ExtensionPluginRegistry'
import type { ExtensionPlugin } from '@/types/extension'
import { PluginManagerBase } from './PluginManagerBase'

/**
 * Manages app extension plugins (UI widgets for activity details)
 * Extends PluginManagerBase to eliminate code duplication
 */
export class AppExtensionPluginManager extends PluginManagerBase<ExtensionPlugin> {
  private static instance: AppExtensionPluginManager

  protected readonly storageKey = 'enabledAppExtensions'
  protected readonly allPlugins = allAppPlugins
  protected readonly defaultPlugins = [
    'standard-details',
    'aggregated-details',
    'profile-sharing',
    'goals',
    'statistics',
    // On by default because it shows nothing until the recorder provider is
    // connected, and only on a native build. Off by default would mean
    // enabling two plugins to get one feature.
    'recorder-quick-action'
  ]

  private constructor() {
    super()
  }

  public static getInstance(): AppExtensionPluginManager {
    if (!AppExtensionPluginManager.instance) {
      AppExtensionPluginManager.instance = new AppExtensionPluginManager()
    }
    return AppExtensionPluginManager.instance
  }

  protected getPluginId(plugin: ExtensionPlugin): string {
    return plugin.id
  }

  /**
   * Legacy method - kept for backward compatibility
   * Use getEnabledPlugins() instead (inherited from base class)
   */
  public async getMyAppExtensions(): Promise<ExtensionPlugin[]> {
    return this.getEnabledPlugins()
  }
}
