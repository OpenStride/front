import type { ProviderPlugin } from '@/types/provider'

const modules = import.meta.glob('@plugins/data-providers/**/client/index.ts', {
  eager: true
}) as Record<string, { default: ProviderPlugin }>

export const allProviderPlugins: ProviderPlugin[] = Object.values(modules).map(mod => mod.default)

/**
 * Plugins a user may still connect.
 *
 * `allProviderPlugins` stays complete on purpose: a deprecated plugin must
 * still resolve for whoever already enabled it — its setup page, its label and
 * the provenance of the activities it imported all depend on being found.
 */
export const installableProviderPlugins: ProviderPlugin[] = allProviderPlugins.filter(
  p => !p.deprecated
)
