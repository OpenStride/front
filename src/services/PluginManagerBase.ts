import { IndexedDBService } from './IndexedDBService'
import { PluginPreferencesService } from './PluginPreferencesService'
import { preferenceDeclarationsOf } from '@/types/plugin-preferences'

/**
 * Base class for all plugin managers
 *
 * Eliminates code duplication across DataProviderPluginManager,
 * StoragePluginManager, and AppExtensionPluginManager.
 *
 * Benefits:
 * - DRY: Common logic implemented once
 * - Consistency: All managers behave identically
 * - Maintainability: Fixes apply to all managers
 * - Type safety: Generic type parameter enforces plugin type
 */
export abstract class PluginManagerBase<T> {
  /**
   * Storage key for enabled plugin IDs in IndexedDB
   * Example: 'enabledDataProviderPlugins', 'enabledStoragePlugins', 'enabledAppExtensions'
   */
  protected abstract readonly storageKey: string

  /**
   * Array of all available plugins of this type
   * Provided by plugin registries (auto-discovered via import.meta.glob)
   */
  protected abstract readonly allPlugins: T[]

  /**
   * Default plugin IDs to enable on first run
   * Empty array = no defaults
   */
  protected abstract readonly defaultPlugins: string[]

  /**
   * Get the ID of a plugin
   * Must be implemented by subclass since plugin types differ
   */
  protected abstract getPluginId(plugin: T): string

  /**
   * Storage key for the plugin IDs that have already been installed once.
   *
   * Tracked separately from the enabled list because the two answer different
   * questions: enabling is reversible and happens many times, installing happens
   * once and is what gates preference seeding.
   */
  protected get installedStorageKey(): string {
    return `${this.storageKey}_installed`
  }

  /**
   * Enable a plugin by adding it to the enabled list
   */
  public async enablePlugin(pluginId: string): Promise<void> {
    const db = await IndexedDBService.getInstance()
    const enabledIds = await this.getEnabledPluginIds()

    if (!enabledIds.includes(pluginId)) {
      enabledIds.push(pluginId)
      await db.saveData(this.storageKey, enabledIds)
    }

    await this.markInstalled(pluginId)
  }

  /**
   * Record a plugin as installed and, the first time only, seed the defaults it
   * declares for preferences that hold no value yet.
   *
   * Disabling and re-enabling a plugin must not resurrect a default the user has
   * changed since, so everything here is gated on the installed list rather than
   * the enabled one.
   */
  private async markInstalled(pluginId: string): Promise<void> {
    const db = await IndexedDBService.getInstance()
    const stored = await db.getData<string[]>(this.installedStorageKey)
    const installedIds = Array.isArray(stored) ? stored : []

    if (installedIds.includes(pluginId)) return

    const plugin = this.getPluginById(pluginId)
    if (plugin) {
      try {
        await PluginPreferencesService.getInstance().seedDefaults(
          pluginId,
          preferenceDeclarationsOf(plugin)
        )
      } catch (error) {
        // A preference that could not be seeded must not block the install.
        console.warn(`[PluginManager] Failed to seed preferences for "${pluginId}"`, error)
      }
    }

    installedIds.push(pluginId)
    await db.saveData(this.installedStorageKey, installedIds)
  }

  /**
   * Treat every currently enabled plugin as installed, seeding any preference it
   * declares that has no value yet.
   *
   * Covers plugins that were enabled before this system existed: for them, "the
   * moment of install" is the first run that knows about their declarations.
   * Idempotent, so it is safe to call on every boot.
   */
  public async reconcileInstalledPlugins(): Promise<void> {
    const enabledIds = await this.getEnabledPluginIds()
    for (const pluginId of enabledIds) {
      await this.markInstalled(pluginId)
    }
  }

  /**
   * Disable a plugin by removing it from the enabled list
   */
  public async disablePlugin(pluginId: string): Promise<void> {
    const db = await IndexedDBService.getInstance()
    const enabledIds = await this.getEnabledPluginIds()
    const filtered = enabledIds.filter(id => id !== pluginId)
    await db.saveData(this.storageKey, filtered)
  }

  /**
   * Toggle a plugin's enabled state
   * @returns new enabled state (true if now enabled, false if disabled)
   */
  public async togglePlugin(pluginId: string): Promise<boolean> {
    const isEnabled = await this.isPluginEnabled(pluginId)
    if (isEnabled) {
      await this.disablePlugin(pluginId)
      return false
    } else {
      await this.enablePlugin(pluginId)
      return true
    }
  }

  /**
   * Check if a specific plugin is enabled
   */
  public async isPluginEnabled(pluginId: string): Promise<boolean> {
    const enabledIds = await this.getEnabledPluginIds()
    return enabledIds.includes(pluginId)
  }

  /**
   * Get list of enabled plugin IDs from IndexedDB
   * Returns default plugins if no data exists yet (first run or data lost)
   * Does NOT write defaults on read — avoids overwriting user preferences
   * if IndexedDB temporarily returns null (tab sleep, storage pressure, etc.)
   */
  public async getEnabledPluginIds(): Promise<string[]> {
    const db = await IndexedDBService.getInstance()
    const ids = await db.getData(this.storageKey)

    if (!Array.isArray(ids)) {
      return [...this.defaultPlugins]
    }

    return ids
  }

  /**
   * Get array of enabled plugin objects
   * Filters allPlugins by enabled IDs
   */
  public async getEnabledPlugins(): Promise<T[]> {
    const enabledIds = await this.getEnabledPluginIds()
    return this.allPlugins.filter(p => enabledIds.includes(this.getPluginId(p)))
  }

  /**
   * Get all available plugins (enabled + disabled)
   */
  public getAllPlugins(): T[] {
    return this.allPlugins
  }

  /**
   * Get a specific plugin by ID
   * Returns undefined if not found
   */
  public getPluginById(pluginId: string): T | undefined {
    return this.allPlugins.find(p => this.getPluginId(p) === pluginId)
  }
}
