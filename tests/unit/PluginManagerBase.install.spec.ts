import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------- In-memory IndexedDB ----------

const settings = new Map<string, unknown>()

vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: vi.fn(async () => ({
      getData: async (key: string) => (settings.has(key) ? settings.get(key) : null),
      saveData: async (key: string, value: unknown) => {
        settings.set(key, value)
      },
      deleteData: async (key: string) => {
        settings.delete(key)
      },
      emitter: new EventTarget()
    }))
  }
}))

import { PluginManagerBase } from '@/services/PluginManagerBase'
import { PluginPreferencesService } from '@/services/PluginPreferencesService'
import type { PluginPreferenceDeclaration } from '@/types/plugin-preferences'

interface TestPlugin {
  id: string
  label: string
  preferences?: PluginPreferenceDeclaration[]
}

const dropbox: TestPlugin = {
  id: 'dropbox',
  label: 'Dropbox',
  preferences: [
    { key: 'publicFileProvider', shared: true, default: 'dropbox' },
    { key: 'chunkSize', default: 8 }
  ]
}

const gdrive: TestPlugin = {
  id: 'gdrive',
  label: 'Google Drive',
  preferences: [{ key: 'publicFileProvider', shared: true, default: 'gdrive' }]
}

const plain: TestPlugin = { id: 'plain', label: 'No preferences' }

class TestManager extends PluginManagerBase<TestPlugin> {
  protected readonly storageKey = 'enabledTestPlugins'
  protected readonly allPlugins = [dropbox, gdrive, plain]
  protected readonly defaultPlugins: string[] = []

  protected getPluginId(plugin: TestPlugin): string {
    return plugin.id
  }
}

const prefs = PluginPreferencesService.getInstance()
let manager: TestManager

beforeEach(() => {
  settings.clear()
  prefs.invalidate()
  manager = new TestManager()
})

describe('PluginManagerBase install tracking', () => {
  it('seeds a plugin declared defaults when it is installed', async () => {
    await manager.enablePlugin('dropbox')

    expect(await prefs.getShared('publicFileProvider')).toBe('dropbox')
    expect(await prefs.getPluginPreference('dropbox', 'chunkSize')).toBe(8)
  })

  it('records the plugin as installed, separately from being enabled', async () => {
    await manager.enablePlugin('dropbox')

    expect(settings.get('enabledTestPlugins')).toEqual(['dropbox'])
    expect(settings.get('enabledTestPlugins_installed')).toEqual(['dropbox'])
  })

  it('does not re-seed a default the user changed, after disable and re-enable', async () => {
    await manager.enablePlugin('dropbox')
    await prefs.set('dropbox.chunkSize', 64)

    await manager.disablePlugin('dropbox')
    await manager.enablePlugin('dropbox')

    expect(await prefs.getPluginPreference('dropbox', 'chunkSize')).toBe(64)
  })

  it('does not resurrect a preference the user removed, on re-enable', async () => {
    await manager.enablePlugin('dropbox')
    await prefs.remove('dropbox.chunkSize')

    await manager.disablePlugin('dropbox')
    await manager.enablePlugin('dropbox')

    expect(await prefs.has('dropbox.chunkSize')).toBe(false)
  })

  it('leaves a shared preference to the plugin installed first', async () => {
    await manager.enablePlugin('gdrive')
    await manager.enablePlugin('dropbox')

    expect(await prefs.getShared('publicFileProvider')).toBe('gdrive')
  })

  it('enabling twice is idempotent', async () => {
    await manager.enablePlugin('dropbox')
    await manager.enablePlugin('dropbox')

    expect(settings.get('enabledTestPlugins')).toEqual(['dropbox'])
    expect(settings.get('enabledTestPlugins_installed')).toEqual(['dropbox'])
  })

  it('installs a plugin that declares no preference without failing', async () => {
    await manager.enablePlugin('plain')

    expect(settings.get('enabledTestPlugins_installed')).toEqual(['plain'])
    expect(await prefs.getAll()).toEqual({})
  })

  it('enables an unknown plugin id without seeding anything', async () => {
    await manager.enablePlugin('ghost')

    expect(settings.get('enabledTestPlugins_installed')).toEqual(['ghost'])
    expect(await prefs.getAll()).toEqual({})
  })
})

describe('PluginManagerBase.reconcileInstalledPlugins', () => {
  it('seeds plugins that were enabled before the preference system existed', async () => {
    // Enabled list written directly: no install was ever recorded for it.
    settings.set('enabledTestPlugins', ['dropbox'])

    await manager.reconcileInstalledPlugins()

    expect(await prefs.getPluginPreference('dropbox', 'chunkSize')).toBe(8)
    expect(settings.get('enabledTestPlugins_installed')).toEqual(['dropbox'])
  })

  it('is idempotent across boots', async () => {
    settings.set('enabledTestPlugins', ['dropbox'])

    await manager.reconcileInstalledPlugins()
    await prefs.set('dropbox.chunkSize', 64)
    await manager.reconcileInstalledPlugins()

    expect(await prefs.getPluginPreference('dropbox', 'chunkSize')).toBe(64)
  })

  it('ignores disabled plugins', async () => {
    settings.set('enabledTestPlugins', ['dropbox'])

    await manager.reconcileInstalledPlugins()

    expect(await prefs.has('gdrive.publicFileProvider')).toBe(false)
    expect(settings.get('enabledTestPlugins_installed')).toEqual(['dropbox'])
  })
})
