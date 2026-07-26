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

import { PluginPreferencesService } from '@/services/PluginPreferencesService'
import { resolvePreferenceKey } from '@/types/plugin-preferences'

const service = PluginPreferencesService.getInstance()

beforeEach(() => {
  settings.clear()
  service.invalidate()
})

describe('resolvePreferenceKey', () => {
  it('namespaces a key under its plugin by default', () => {
    expect(resolvePreferenceKey('dropbox', { key: 'chunkSize' })).toBe('dropbox.chunkSize')
  })

  it('leaves a shared key in the global namespace', () => {
    expect(resolvePreferenceKey('dropbox', { key: 'publicFileProvider', shared: true })).toBe(
      'publicFileProvider'
    )
  })
})

describe('PluginPreferencesService.seedDefaults', () => {
  it('writes the default of a preference that has no value yet', async () => {
    const seeded = await service.seedDefaults('dropbox', [{ key: 'chunkSize', default: 8 }])

    expect(seeded).toEqual(['dropbox.chunkSize'])
    expect(await service.getPluginPreference('dropbox', 'chunkSize')).toBe(8)
  })

  it('never overwrites a value the user already has', async () => {
    await service.set('dropbox.chunkSize', 32)

    const seeded = await service.seedDefaults('dropbox', [{ key: 'chunkSize', default: 8 }])

    expect(seeded).toEqual([])
    expect(await service.getPluginPreference('dropbox', 'chunkSize')).toBe(32)
  })

  it('keeps a stored value that happens to be falsy', async () => {
    await service.set('dropbox.autoPublish', false)

    const seeded = await service.seedDefaults('dropbox', [{ key: 'autoPublish', default: true }])

    expect(seeded).toEqual([])
    expect(await service.getPluginPreference('dropbox', 'autoPublish')).toBe(false)
  })

  it('leaves a shared key to whichever plugin was installed first', async () => {
    await service.seedDefaults('gdrive', [
      { key: 'publicFileProvider', shared: true, default: 'gdrive' }
    ])

    const seeded = await service.seedDefaults('dropbox', [
      { key: 'publicFileProvider', shared: true, default: 'dropbox' }
    ])

    expect(seeded).toEqual([])
    expect(await service.getShared('publicFileProvider')).toBe('gdrive')
  })

  it('claims a shared key when no plugin has taken it', async () => {
    await service.seedDefaults('dropbox', [
      { key: 'publicFileProvider', shared: true, default: 'dropbox' }
    ])

    expect(await service.getShared('publicFileProvider')).toBe('dropbox')
  })

  it('seeds only the missing keys of a partially configured plugin', async () => {
    await service.set('dropbox.a', 'kept')

    const seeded = await service.seedDefaults('dropbox', [
      { key: 'a', default: 'seeded' },
      { key: 'b', default: 'seeded' }
    ])

    expect(seeded).toEqual(['dropbox.b'])
    expect(await service.getPluginPreference('dropbox', 'a')).toBe('kept')
    expect(await service.getPluginPreference('dropbox', 'b')).toBe('seeded')
  })

  it('does nothing when a plugin declares no preference', async () => {
    expect(await service.seedDefaults('dropbox', [])).toEqual([])
    expect(await service.getAll()).toEqual({})
  })

  it('persists the seeded values across a cache drop', async () => {
    await service.seedDefaults('dropbox', [{ key: 'chunkSize', default: 8 }])
    service.invalidate()

    expect(await service.getPluginPreference('dropbox', 'chunkSize')).toBe(8)
  })
})

describe('PluginPreferencesService read/write', () => {
  it('returns undefined for a key that was never set', async () => {
    expect(await service.get('nope')).toBeUndefined()
    expect(await service.has('nope')).toBe(false)
  })

  it('round-trips a shared value', async () => {
    await service.setShared('publicFileProvider', 'dropbox')

    expect(await service.getShared('publicFileProvider')).toBe('dropbox')
    expect(await service.get('publicFileProvider')).toBe('dropbox')
  })

  it('round-trips a plugin-scoped value without colliding across plugins', async () => {
    await service.setPluginPreference('dropbox', 'folder', '/a')
    await service.setPluginPreference('gdrive', 'folder', '/b')

    expect(await service.getPluginPreference('dropbox', 'folder')).toBe('/a')
    expect(await service.getPluginPreference('gdrive', 'folder')).toBe('/b')
  })

  it('removes a key', async () => {
    await service.set('dropbox.folder', '/a')
    await service.remove('dropbox.folder')

    expect(await service.has('dropbox.folder')).toBe(false)
  })

  it('emits preferences-changed with the keys that moved', async () => {
    const seen: string[][] = []
    const handler = ((event: CustomEvent<{ keys: string[] }>) => {
      seen.push(event.detail.keys)
    }) as EventListener
    service.emitter.addEventListener('preferences-changed', handler)

    await service.set('dropbox.folder', '/a')
    await service.seedDefaults('gdrive', [{ key: 'folder', default: '/b' }])

    service.emitter.removeEventListener('preferences-changed', handler)
    expect(seen).toEqual([['dropbox.folder'], ['gdrive.folder']])
  })

  it('stays silent when seeding writes nothing', async () => {
    await service.set('dropbox.folder', '/a')

    let emitted = 0
    const handler = () => {
      emitted++
    }
    service.emitter.addEventListener('preferences-changed', handler)

    await service.seedDefaults('dropbox', [{ key: 'folder', default: '/b' }])

    service.emitter.removeEventListener('preferences-changed', handler)
    expect(emitted).toBe(0)
  })

  it('keeps concurrent writes from clobbering each other', async () => {
    await Promise.all([
      service.set('a', 1),
      service.set('b', 2),
      service.seedDefaults('dropbox', [{ key: 'c', default: 3 }])
    ])

    service.invalidate()
    expect(await service.getAll()).toEqual({ a: 1, b: 2, 'dropbox.c': 3 })
  })
})
