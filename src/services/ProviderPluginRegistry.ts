import type { ProviderPlugin } from '@/types/provider'

const modules = import.meta.glob('@plugins/data-providers/**/client/index.ts', {
  eager: true
}) as Record<string, { default: ProviderPlugin }>

export const allProviderPlugins: ProviderPlugin[] = Object.values(modules)
  .map(mod => mod.default)
  // Native-only plugins (HealthKit / Health Connect) declare available(); hide them on web.
  .filter(p => !p.available || p.available())
