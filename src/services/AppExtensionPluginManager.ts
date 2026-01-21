// Manages user-enabled app extension plugins
import { allAppPlugins } from '@/services/ExtensionPluginRegistry';
import { IndexedDBService } from '@/services/IndexedDBService';
import type { ExtensionPlugin } from '@/types/extension';

const STORAGE_KEY = 'enabledAppExtensions';
const DEFAULT_PLUGINS = ['standard-details', 'aggregated-details', 'aggregated-progress'];

export class AppExtensionPluginManager {
    private static instance: AppExtensionPluginManager;
    private constructor() { }

    public static getInstance(): AppExtensionPluginManager {
        if (!AppExtensionPluginManager.instance) {
            AppExtensionPluginManager.instance = new AppExtensionPluginManager();
        }
        return AppExtensionPluginManager.instance;
    }

    /**
     * Enable a plugin by adding it to the enabled list
     */
    public async enablePlugin(pluginId: string): Promise<void> {
        const db = await IndexedDBService.getInstance();
        const enabledIds = await this.getEnabledPluginIds();
        if (!enabledIds.includes(pluginId)) {
            enabledIds.push(pluginId);
            await db.saveData(STORAGE_KEY, enabledIds);
        }
    }

    /**
     * Disable a plugin by removing it from the enabled list
     */
    public async disablePlugin(pluginId: string): Promise<void> {
        const db = await IndexedDBService.getInstance();
        const enabledIds = await this.getEnabledPluginIds();
        const filtered = enabledIds.filter(id => id !== pluginId);
        await db.saveData(STORAGE_KEY, filtered);
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
        const ids = await db.getData(STORAGE_KEY);

        // Initialize with defaults on first run
        if (!Array.isArray(ids)) {
            await db.saveData(STORAGE_KEY, DEFAULT_PLUGINS);
            return DEFAULT_PLUGINS;
        }

        return ids;
    }

    /**
     * Get array of enabled plugin objects
     */
    public async getMyAppExtensions(): Promise<ExtensionPlugin[]> {
        const enabledIds = await this.getEnabledPluginIds();
        return allAppPlugins.filter(p => enabledIds.includes(p.id));
    }
}
