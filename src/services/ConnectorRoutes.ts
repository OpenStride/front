import type { Router } from 'vue-router'
import { allProviderPlugins } from '@/services/ProviderPluginRegistry'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'

/**
 * Install the pages that data and storage plugins declare — their OAuth
 * callbacks. Every bundled plugin's, enabled or not: the provider redirects
 * back while the plugin is still being connected, and a deprecated provider
 * keeps the routes its existing users rely on.
 *
 * The core used to carry these pages itself, which is how it came to know the
 * Garmin callback's address and the name of the Drive token.
 */
export function registerConnectorRoutes(router: Router): void {
  for (const plugin of [...allProviderPlugins, ...allStoragePlugins]) {
    for (const route of plugin.routes ?? []) router.addRoute(route)
  }
}
