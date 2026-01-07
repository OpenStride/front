// src/services/AppPluginRegistry.ts
import type { ExtensionPlugin } from '@/types/extension'
import { IndexedDBService } from '@/services/IndexedDBService'

// Chargement automatique de tous les plugins applicatifs
const modules = import.meta.glob('../../plugins/app-extensions/**/index.ts', { eager: true }) as Record<string, { default: ExtensionPlugin }>

export const allAppPlugins: ExtensionPlugin[] = Object.values(modules).map(m => m.default)

export async function getActiveAppPlugins(): Promise<ExtensionPlugin[]> {
    //const enabledIds = await IndexedDBService.getInstance().getData('enabled_app_plugins') || []
    //mock
    const enabledIds = ['standard-details', 'aggregated-details', 'aggregated-progress'];
    return allAppPlugins.filter(p => enabledIds.includes(p.id))
}

export async function getPluginViewsForSlot(slotName: string): Promise<any[]> {
    const plugins = await getActiveAppPlugins()
    const views = []

    for (const plugin of plugins) {
        const slot = plugin.slots?.[slotName]
        if (slot) {
            const loaders = Array.isArray(slot) ? slot : [slot]
            for (const load of loaders) {
                const component = await load()
                views.push(component)
            }
        }
    }

    return views
}
