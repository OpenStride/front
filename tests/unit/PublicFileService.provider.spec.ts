import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StoragePlugin } from '@/types/storage'

// ---------- Mocks ----------

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

let enabledPlugins: StoragePlugin[] = []

vi.mock('@/services/StoragePluginManager', () => ({
  StoragePluginManager: {
    getInstance: vi.fn(() => ({
      getMyStoragePlugins: async () => enabledPlugins
    }))
  }
}))

import { PublicFileService } from '@/services/PublicFileService'
import { PluginPreferencesService } from '@/services/PluginPreferencesService'
import { PUBLIC_FILE_PROVIDER_PREFERENCE } from '@/types/storage'

function fakePlugin(id: string, supportsPublicFiles: boolean): StoragePlugin {
  return {
    id,
    label: id,
    setupComponent: async () => ({}),
    readRemote: async () => [],
    writeRemote: async () => undefined,
    supportsPublicFiles,
    writePublicFile: async () => `https://example.test/${id}`,
    deleteFile: async () => true,
    getPublicFileUrl: async () => `https://example.test/${id}`
  }
}

const gdrive = fakePlugin('gdrive', true)
const dropbox = fakePlugin('dropbox', true)
const backupOnly = fakePlugin('backup-only', false)

const prefs = PluginPreferencesService.getInstance()
const service = PublicFileService.getInstance()

beforeEach(() => {
  settings.clear()
  prefs.invalidate()
  enabledPlugins = []
  // The service caches its pick; clear it the way a preference change does.
  prefs.emitter.dispatchEvent(
    new CustomEvent('preferences-changed', { detail: { keys: [PUBLIC_FILE_PROVIDER_PREFERENCE] } })
  )
})

describe('PublicFileService provider selection', () => {
  it('lists only the enabled plugins that can publish public files', async () => {
    enabledPlugins = [gdrive, backupOnly, dropbox]

    const providers = await service.listPublicFileProviders()

    expect(providers.map(p => p.id)).toEqual(['gdrive', 'dropbox'])
  })

  it('publishes through the plugin the preference names', async () => {
    enabledPlugins = [gdrive, dropbox]
    await prefs.setShared(PUBLIC_FILE_PROVIDER_PREFERENCE, 'dropbox')

    expect(await service.writePublicFile('manifest.json', {})).toBe('https://example.test/dropbox')
  })

  it('honours the preference regardless of plugin discovery order', async () => {
    enabledPlugins = [dropbox, gdrive]
    await prefs.setShared(PUBLIC_FILE_PROVIDER_PREFERENCE, 'gdrive')

    expect(await service.writePublicFile('manifest.json', {})).toBe('https://example.test/gdrive')
  })

  it('falls back to the first capable plugin when no preference is set', async () => {
    enabledPlugins = [gdrive, dropbox]

    expect(await service.writePublicFile('manifest.json', {})).toBe('https://example.test/gdrive')
  })

  it('falls back when the preference names a plugin that is no longer enabled', async () => {
    enabledPlugins = [gdrive]
    await prefs.setShared(PUBLIC_FILE_PROVIDER_PREFERENCE, 'dropbox')

    expect(await service.writePublicFile('manifest.json', {})).toBe('https://example.test/gdrive')
  })

  it('reports no support when no enabled plugin can publish', async () => {
    enabledPlugins = [backupOnly]

    expect(await service.hasPublicFileSupport()).toBe(false)
    expect(await service.writePublicFile('manifest.json', {})).toBeNull()
  })

  it('switches provider when the preference changes', async () => {
    enabledPlugins = [gdrive, dropbox]

    expect(await service.writePublicFile('manifest.json', {})).toBe('https://example.test/gdrive')

    await prefs.setShared(PUBLIC_FILE_PROVIDER_PREFERENCE, 'dropbox')

    expect(await service.writePublicFile('manifest.json', {})).toBe('https://example.test/dropbox')
  })
})
