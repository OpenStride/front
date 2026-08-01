import type { ProviderPlugin } from '@/types/provider'

const modules = import.meta.glob('@plugins/data-providers/**/client/index.ts', {
  eager: true
}) as Record<string, { default: ProviderPlugin }>

export const allProviderPlugins: ProviderPlugin[] = Object.values(modules).map(mod => mod.default)

/**
 * Plugins a user may still connect.
 *
 * `allProviderPlugins` stays complete on purpose: a plugin that is withdrawn —
 * or that has nothing to talk to on this platform — must still resolve for
 * whoever already enabled it: its setup page, its label and the provenance of
 * the activities it imported all depend on being found.
 *
 * Two different reasons to leave this list. `deprecated` is a decision about
 * the plugin; `available()` is a fact about where the app is running — the
 * native-only providers (Apple Health, Health Connect, the GPS recorder)
 * answer false in a browser.
 */
export const installableProviderPlugins: ProviderPlugin[] = allProviderPlugins.filter(
  p => !p.deprecated && (!p.available || p.available())
)
