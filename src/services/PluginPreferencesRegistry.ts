/**
 * PluginPreferencesRegistry
 *
 * Bridges the three plugin managers and PluginPreferencesService.
 *
 * It lives outside the service on purpose: PluginPreferencesService is a plain
 * store and knows nothing about plugins, which keeps it out of the import cycle
 * that plugins → PluginContextFactory → managers → PluginManagerBase already
 * forms.
 */

import { DataProviderPluginManager } from './DataProviderPluginManager'
import { StoragePluginManager } from './StoragePluginManager'
import { AppExtensionPluginManager } from './AppExtensionPluginManager'
import { PluginPreferencesService } from './PluginPreferencesService'
import {
  preferenceDeclarationsOf,
  resolvePreferenceKey,
  type PluginPreferenceOption,
  type ResolvedPluginPreference
} from '@/types/plugin-preferences'

type NamedPlugin = { id: string; label: string }

async function enabledPluginsOfEveryType(): Promise<NamedPlugin[]> {
  const [providers, storages, extensions] = await Promise.all([
    DataProviderPluginManager.getInstance().getEnabledPlugins(),
    StoragePluginManager.getInstance().getEnabledPlugins(),
    AppExtensionPluginManager.getInstance().getEnabledPlugins()
  ])

  return [...providers, ...storages, ...extensions] as NamedPlugin[]
}

/**
 * Record every enabled plugin as installed, seeding the defaults it declares.
 *
 * Run once at boot. It is what gives their defaults to plugins that were
 * enabled before the preference system existed; for everything else it is a
 * no-op, since enabling already marks a plugin installed.
 */
export async function reconcileAllInstalledPlugins(): Promise<void> {
  await Promise.all([
    DataProviderPluginManager.getInstance().reconcileInstalledPlugins(),
    StoragePluginManager.getInstance().reconcileInstalledPlugins(),
    AppExtensionPluginManager.getInstance().reconcileInstalledPlugins()
  ])
}

async function resolveOptions(
  declaration: ResolvedPluginPreference['declaration']
): Promise<PluginPreferenceOption[]> {
  const { options } = declaration
  if (!options) return []

  if (typeof options === 'function') {
    try {
      return await options()
    } catch (error) {
      console.warn(`[PluginPreferences] Failed to resolve options for "${declaration.key}"`, error)
      return []
    }
  }

  return options
}

/**
 * Every preference declared by an enabled plugin that carries a label, paired
 * with its current value — what the preferences screen renders.
 *
 * A declaration without a label stays internal and is not listed. Shared keys
 * are declared by several plugins at once, so only the first declaration seen
 * is kept: they describe the same preference, and rendering it twice would let
 * two controls fight over one value.
 */
export async function listVisiblePreferences(): Promise<ResolvedPluginPreference[]> {
  const service = PluginPreferencesService.getInstance()
  const [plugins, values] = await Promise.all([enabledPluginsOfEveryType(), service.getAll()])

  const resolved: ResolvedPluginPreference[] = []
  const seen = new Set<string>()

  for (const plugin of plugins) {
    for (const declaration of preferenceDeclarationsOf(plugin)) {
      if (!declaration.label) continue

      const storageKey = resolvePreferenceKey(plugin.id, declaration)
      if (seen.has(storageKey)) continue
      seen.add(storageKey)

      resolved.push({
        storageKey,
        declaration,
        pluginId: plugin.id,
        pluginLabel: plugin.label,
        value: values[storageKey] ?? declaration.default,
        options: await resolveOptions(declaration)
      })
    }
  }

  return resolved
}
