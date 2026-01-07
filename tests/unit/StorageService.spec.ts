import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageService } from '@/services/StorageService'
import { StoragePluginManager } from '@/services/StoragePluginManager'

// Mock IndexedDBService pour éviter l’accès réel
vi.mock('@/services/IndexedDBService', () => {
  class FakeDB {
    private stores: Record<string, any[]> = {
      settings: [],
      activities: [],
      activity_details: [],
      notifLogs: []
    }
    async getObjectStoresNames() { return Object.keys(this.stores) }
    async exportDB(store: string) { return [...(this.stores[store] || [])] }
    async addItemsToStore(store: string, items: any[]) { this.stores[store] = [...(this.stores[store] || []), ...items] }
    async saveData(key: string, value: any) { /* no-op */ }
    async getData(key: string) { return null }
    emitter = new EventTarget()
  }
  let instance: any
  return {
    IndexedDBService: {
      getInstance: async () => { if (!instance) instance = new FakeDB(); return instance }
    }
  }
})

// Mock plugin manager
vi.mock('@/services/StoragePluginManager', () => {
  class FakeManager {
    plugins: any[] = []
    setPlugins(p: any[]) { this.plugins = p }
    async getMyStoragePlugins() { return this.plugins }
  }
  const inst = new FakeManager()
  return { StoragePluginManager: { getInstance: () => inst } }
})

describe('StorageService.syncStores', () => {
  beforeEach(() => {
    // réinitialise plugins mockés
    const mgr: any = StoragePluginManager.getInstance()
    mgr.setPlugins([])
  })

  it('ne fait rien si aucun plugin actif', async () => {
    const svc = StorageService.getInstance()
    await expect(svc.syncStores([{ store: 'activities', key: '' }])).resolves.toBeUndefined()
  })

  it('pousse des éléments locaux vers un plugin distant vide', async () => {
    // Préparation: injecte un plugin de test
    const pushed: Record<string, any[]> = {}
    const plugin = {
      id: 'mock-storage',
      label: 'Mock Storage',
      async readRemote(store: string) { return [] },
      async writeRemote(store: string, data: any[]) { pushed[store] = data }
    }
    const mgr: any = StoragePluginManager.getInstance()
    mgr.setPlugins([plugin])

    // On insère un élément local dans la store activities via FakeDB
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    const db: any = await (IndexedDBService as any).getInstance()
    await db.addItemsToStore('activities', [{ id: 'a1', distance: 1000 }])

    const svc = StorageService.getInstance()
    await svc.syncStores([{ store: 'activities', key: '' }])
    expect(pushed['activities']).toBeTruthy()
    expect(pushed['activities'].length).toBe(1)
    expect(pushed['activities'][0].id).toBe('a1')
  })
})
