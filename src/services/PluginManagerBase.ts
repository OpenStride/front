import { IndexedDBService } from './IndexedDBService';

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
    protected abstract readonly storageKey: string;

    /**
     * Array of all available plugins of this type
     * Provided by plugin registries (auto-discovered via import.meta.glob)
     */
    protected abstract readonly allPlugins: T[];

    /**
     * Default plugin IDs to enable on first run
     * Empty array = no defaults
     */
    protected abstract readonly defaultPlugins: string[];

    /**
     * Get the ID of a plugin
     * Must be implemented by subclass since plugin types differ
     */
    protected abstract getPluginId(plugin: T): string;

    /**
     * Enable a plugin by adding it to the enabled list
     */
    public async enablePlugin(pluginId: string): Promise<void> {
        const db = await IndexedDBService.getInstance();
        const enabledIds = await this.getEnabledPluginIds();

        if (!enabledIds.includes(pluginId)) {
            enabledIds.push(pluginId);
            await db.saveData(this.storageKey, enabledIds);
        }
    }

    /**
     * Disable a plugin by removing it from the enabled list
     */
    public async disablePlugin(pluginId: string): Promise<void> {
        const db = await IndexedDBService.getInstance();
        const enabledIds = await this.getEnabledPluginIds();
        const filtered = enabledIds.filter(id => id !== pluginId);
        await db.saveData(this.storageKey, filtered);
    }

    /**
     * Toggle a plugin's enabled state
     * @returns new enabled state (true if now enabled, false if disabled)
     */
    public async togglePlugin(pluginId: string): Promise<boolean> {
        const isEnabled = await this.isPluginEnabled(pluginId);
        if (isEnabled) {
            await this.disablePlugin(pluginId);
            return false;
        } else {
            await this.enablePlugin(pluginId);
            return true;
        }
    }

    /**
     * Check if a specific plugin is enabled
     */
    public async isPluginEnabled(pluginId: string): Promise<boolean> {
        const enabledIds = await this.getEnabledPluginIds();
        return enabledIds.includes(pluginId);
    }

    /**
     * Get list of enabled plugin IDs from IndexedDB
     * Returns default plugins if no data exists (first run)
     */
    public async getEnabledPluginIds(): Promise<string[]> {
        const db = await IndexedDBService.getInstance();
        const ids = await db.getData(this.storageKey);

        // Initialize with defaults on first run
        if (!Array.isArray(ids)) {
            if (this.defaultPlugins.length > 0) {
                await db.saveData(this.storageKey, this.defaultPlugins);
                return this.defaultPlugins;
            }
            return [];
        }

        return ids;
    }

    /**
     * Get array of enabled plugin objects
     * Filters allPlugins by enabled IDs
     */
    public async getEnabledPlugins(): Promise<T[]> {
        const enabledIds = await this.getEnabledPluginIds();
        return this.allPlugins.filter(p => enabledIds.includes(this.getPluginId(p)));
    }

    /**
     * Get all available plugins (enabled + disabled)
     */
    public getAllPlugins(): T[] {
        return this.allPlugins;
    }

    /**
     * Get a specific plugin by ID
     * Returns undefined if not found
     */
    public getPluginById(pluginId: string): T | undefined {
        return this.allPlugins.find(p => this.getPluginId(p) === pluginId);
    }
}
