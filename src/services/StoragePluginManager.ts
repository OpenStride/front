// services/StoragePluginManager.ts
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import type { StoragePlugin } from '@/types/storage'
import { PluginManagerBase } from './PluginManagerBase'

/**
 * Manages storage provider plugins (Google Drive, etc.)
 * Extends PluginManagerBase to eliminate code duplication
 */
export class StoragePluginManager extends PluginManagerBase<StoragePlugin> {
  private static instance: StoragePluginManager

  protected readonly storageKey = 'enabledStoragePlugins'
  protected readonly allPlugins = allStoragePlugins
  protected readonly defaultPlugins: string[] = [] // No defaults - user must explicitly connect

  private constructor() {
    super()
  }

  public static getInstance(): StoragePluginManager {
    if (!StoragePluginManager.instance) {
      StoragePluginManager.instance = new StoragePluginManager()
    }
    return StoragePluginManager.instance
  }

  protected getPluginId(plugin: StoragePlugin): string {
    return plugin.id
  }

  /**
   * Legacy method - kept for backward compatibility
   * Use getEnabledPlugins() instead (inherited from base class)
   */
  public async getMyStoragePlugins(): Promise<StoragePlugin[]> {
    return this.getEnabledPlugins()
  }
}
