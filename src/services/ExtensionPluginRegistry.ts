// src/services/AppPluginRegistry.ts
import type { ExtensionPlugin, SlotContext, SlotEntry } from '@/types/extension'
import type { Component } from 'vue'
import { AppExtensionPluginManager } from '@/services/AppExtensionPluginManager'

// Chargement automatique de tous les plugins applicatifs
const modules = import.meta.glob('../../plugins/app-extensions/**/index.ts', {
  eager: true
}) as Record<string, { default: ExtensionPlugin }>

export const allAppPlugins: ExtensionPlugin[] = Object.values(modules).map(m => m.default)

export async function getActiveAppPlugins(): Promise<ExtensionPlugin[]> {
  const manager = AppExtensionPluginManager.getInstance()
  const enabledIds = await manager.getEnabledPluginIds()
  return allAppPlugins.filter(p => enabledIds.includes(p.id))
}

/**
 * Loaders for the entries that apply, in declaration order.
 *
 * Selection returns *loaders*, not components: `appliesTo` is consulted before
 * anything is imported, so a widget that will not be shown never costs its
 * chunk. Filtering after loading would look identical on screen and still pull
 * every cycling graph onto a pool swim's detail page.
 */
export function selectSlotLoaders(
  entries: Array<SlotEntry | (() => Promise<Component>)>,
  ctx: SlotContext
): Array<() => Promise<Component>> {
  return entries
    .filter(entry => {
      // A bare loader has no opinion and always applies.
      if (typeof entry === 'function') return true
      return !entry.appliesTo || entry.appliesTo(ctx)
    })
    .map(entry => (typeof entry === 'function' ? entry : entry.component))
}

/** Components contributed to a slot by the active plugins. */
/**
 * A slot loader may hand back the component or the whole module.
 *
 * `async () => (await import('./X.vue')).default` yields the component, while
 * the shorter `() => import('./X.vue')` yields the module. Both spellings are
 * in use across the plugins, so every view that rendered a slot carried its own
 * `comp?.default || comp` — four copies of the same guess, and the signature
 * claimed `Component[]` regardless. Unwrapped once, here.
 */
export function unwrapModule(loaded: Component | { default: Component }): Component {
  return loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
}

export async function getPluginViewsForSlot(
  slotName: string,
  ctx: SlotContext = {}
): Promise<Component[]> {
  const plugins = await getActiveAppPlugins()
  const views: Component[] = []

  for (const plugin of plugins) {
    const slot = plugin.slots?.[slotName]
    if (!slot) continue

    const entries = Array.isArray(slot) ? slot : [slot]
    for (const load of selectSlotLoaders(entries, ctx)) {
      views.push(unwrapModule(await load()))
    }
  }

  return views
}
