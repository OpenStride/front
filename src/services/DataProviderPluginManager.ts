// services/DataProviderPluginManager.ts
import { allProviderPlugins } from '@/services/ProviderPluginRegistry'
import type { ProviderPlugin } from '@/types/provider'
import { PluginManagerBase } from './PluginManagerBase'

/**
 * Manages data provider plugins (Garmin, Coros, ZipImport, etc.)
 * Extends PluginManagerBase to eliminate code duplication
 */
export class DataProviderPluginManager extends PluginManagerBase<ProviderPlugin> {
  private static instance: DataProviderPluginManager

  protected readonly storageKey = 'enabledDataProviderPlugins'
  protected readonly allPlugins = allProviderPlugins
  protected readonly defaultPlugins: string[] = [] // No defaults - user must explicitly connect

  private constructor() {
    super()
  }

  public static getInstance(): DataProviderPluginManager {
    if (!DataProviderPluginManager.instance) {
      DataProviderPluginManager.instance = new DataProviderPluginManager()
    }
    return DataProviderPluginManager.instance
  }

  protected getPluginId(plugin: ProviderPlugin): string {
    return plugin.id
  }

  /**
   * Legacy method - kept for backward compatibility
   * Use getEnabledPlugins() instead (inherited from base class)
   */
  public async getMyDataProviderPlugins(): Promise<ProviderPlugin[]> {
    return this.getEnabledPlugins()
  }
}
