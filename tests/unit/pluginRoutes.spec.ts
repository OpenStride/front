import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent } from 'vue'

/**
 * A page dies with the menu entry that opened it.
 *
 * Nav entries come from slots, which are filtered by the enabled plugins, so
 * switching a plugin off removes its entry immediately. Its route was
 * registered unconditionally at boot and stayed live: a bookmark, the back
 * button, or a link on another page still opened a screen the user had just
 * unplugged. `/metrics` was reachable that way from every session best.
 */

const enabledIds: string[] = []

vi.mock('@/services/AppExtensionPluginManager', () => ({
  AppExtensionPluginManager: {
    getInstance: () => ({
      getEnabledPluginIds: async () => enabledIds
    })
  }
}))

const Stub = defineComponent({ template: '<div>plugin page</div>' })

async function buildRouter() {
  const { registerPluginRoutes, DISABLED_PLUGIN_REDIRECT, allAppPlugins } =
    await import('@/services/ExtensionPluginRegistry')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/profile', component: Stub }
    ]
  })
  registerPluginRoutes(router)
  return { router, DISABLED_PLUGIN_REDIRECT, allAppPlugins }
}

describe('plugin routes follow their plugin', () => {
  beforeEach(() => {
    enabledIds.length = 0
  })

  it('registers a route for every route a plugin declares', async () => {
    const { router, allAppPlugins } = await buildRouter()
    const declared = allAppPlugins.flatMap(p => p.routes ?? []).map(r => r.path)
    expect(declared.length).toBeGreaterThan(0)

    const registered = router.getRoutes().map(r => r.path)
    for (const path of declared) expect(registered).toContain(path)
  })

  it('opens the page while its plugin is enabled', async () => {
    const { router, allAppPlugins } = await buildRouter()
    const plugin = allAppPlugins.find(p => p.routes?.length)!
    enabledIds.push(plugin.id)

    await router.push(plugin.routes![0].path)
    expect(router.currentRoute.value.path).toBe(plugin.routes![0].path)
  })

  it('sends the reader to the extensions tab once its plugin is off', async () => {
    const { router, DISABLED_PLUGIN_REDIRECT, allAppPlugins } = await buildRouter()
    const plugin = allAppPlugins.find(p => p.routes?.length)!

    await router.push(plugin.routes![0].path)

    // The switch that turns it back on lives where the redirect lands.
    expect(router.currentRoute.value.fullPath).toBe(DISABLED_PLUGIN_REDIRECT)
  })
})
