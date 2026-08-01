import { describe, it, expect } from 'vitest'
import { allProviderPlugins, installableProviderPlugins } from '@/services/ProviderPluginRegistry'

describe('provider registry', () => {
  it('withdraws deprecated providers from the installable list', () => {
    const deprecated = allProviderPlugins.filter(p => p.deprecated)
    expect(deprecated.length, 'no deprecated provider to check').toBeGreaterThan(0)

    for (const plugin of deprecated) {
      expect(
        installableProviderPlugins.some(p => p.id === plugin.id),
        `"${plugin.id}" is deprecated but still offered`
      ).toBe(false)
    }
  })

  it('keeps deprecated providers resolvable', () => {
    // Whoever already connected one needs its setup page and its label to
    // resolve; only the offer is withdrawn, not the plugin.
    const zip = allProviderPlugins.find(p => p.id === 'zip-import')
    expect(zip, 'zip-import should still resolve').toBeTruthy()
    expect(zip?.deprecated).toBe(true)
    expect(typeof zip?.setupComponent).toBe('function')
  })

  it('still offers every provider that is not deprecated and belongs here', () => {
    const live = allProviderPlugins
      .filter(p => !p.deprecated && (!p.available || p.available()))
      .map(p => p.id)
    expect(installableProviderPlugins.map(p => p.id).sort()).toEqual(live.sort())
  })

  it('hides the native-only providers in a browser, without losing them', () => {
    // Apple Health, Health Connect and the GPS recorder have nothing to talk to
    // on the web. They drop out of the offer for the same reason a deprecated
    // plugin does — and stay resolvable for the same reason too.
    const nativeOnly = allProviderPlugins.filter(p => p.available && !p.available())
    expect(nativeOnly.length, 'no native-only provider to check').toBeGreaterThan(0)

    for (const plugin of nativeOnly) {
      expect(
        installableProviderPlugins.some(p => p.id === plugin.id),
        `"${plugin.id}" is native-only but offered in the browser`
      ).toBe(false)
      expect(typeof plugin.setupComponent).toBe('function')
    }
  })
})
