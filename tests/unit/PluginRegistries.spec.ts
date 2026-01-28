import { describe, it, expect, vi } from 'vitest'
import { allProviderPlugins } from '@/services/ProviderPluginRegistry'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import { allAppPlugins, getPluginViewsForSlot } from '@/services/ExtensionPluginRegistry'

// Mock IndexedDBService to avoid real IndexedDB access
vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: class {
    static instance: any = null
    static async getInstance() {
      if (!this.instance) {
        this.instance = new this()
      }
      return this.instance
    }
    async getData() { return null }
    async saveData() { }
    emitter = new EventTarget()
  }
}))

describe('Plugin registries', () => {
  it('chargent les tableaux (peuvent être vides mais définis)', () => {
    expect(Array.isArray(allProviderPlugins)).toBe(true)
    expect(Array.isArray(allStoragePlugins)).toBe(true)
    expect(Array.isArray(allAppPlugins)).toBe(true)
  })

  it('ids provider uniques', () => {
    const ids = allProviderPlugins.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ExtensionPluginRegistry.getPluginViewsForSlot', () => {
  it('retourne un tableau (async)', async () => {
    const views = await getPluginViewsForSlot('activity.widgets')
    expect(Array.isArray(views)).toBe(true)
  })
})
