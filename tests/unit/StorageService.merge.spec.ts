import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageService } from '@/services/StorageService'
import { StoragePluginManager } from '@/services/StoragePluginManager'

// Mock IndexedDBService avec un store mutable
vi.mock('@/services/IndexedDBService', () => {
  class FakeDB {
    stores: Record<string, any[]> = { settings: [], activities: [], activity_details: [], notifLogs: [] }
    async getObjectStoresNames() { return Object.keys(this.stores) }
    async exportDB(store: string) { return [...(this.stores[store] || [])] }
    async addItemsToStore(store: string, items: any[]) { this.stores[store] = [...(this.stores[store] || []), ...items] }
    async saveData(key: string, value: any) { this.stores.settings.push({ key, value }) }
    async getData(key: string) { const f = this.stores.settings.find(i => i.key === key); return f?.value ?? null }
    async getAllData(store: string) { return this.exportDB(store) }
    async getDataFromStore(store: string, key: string) { return (this.stores[store] || []).find(i => i.id === key || i.activityId === key) }
    emitter = new EventTarget()
  }
  let instance: any
  return { IndexedDBService: { getInstance: async () => { if (!instance) instance = new FakeDB(); return instance } } }
})

// Mock plugin manager pour injecter différents états
vi.mock('@/services/StoragePluginManager', () => {
  class FakeManager { plugins: any[] = []; setPlugins(p: any[]) { this.plugins = p }; async getMyStoragePlugins() { return this.plugins } }
  const inst = new FakeManager();
  return { StoragePluginManager: { getInstance: () => inst } }
})

describe('StorageService fusion logique', () => {
  let svc: StorageService
  let mgr: any
  beforeEach(() => {
    svc = StorageService.getInstance()
    mgr = StoragePluginManager.getInstance()
    mgr.setPlugins([])
  })

  it('importe items distants manquants localement', async () => {
    const remoteData: any[] = [{ id: 'r1', value: 1 }]
    const written: Record<string, any[]> = {}
    mgr.setPlugins([{
      id: 'mock', label: 'Mock',
      readRemote: async (store: string) => store === 'activities' ? remoteData : [],
      writeRemote: async () => { } // pas appelé ici
    }])
    await svc.syncStores([{ store: 'activities', key: '' }])
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    const db: any = await (IndexedDBService as any).getInstance()
    const local = await db.exportDB('activities')
    expect(local.find((i: any) => i.id === 'r1')).toBeTruthy()
  })

  it('pousse modifications locales différentes du distant', async () => {
    const remote: any[] = [{ id: 'a1', val: 1 }]
    const pushed: Record<string, any[]> = {}
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    const db: any = await (IndexedDBService as any).getInstance()
    await db.addItemsToStore('activities', [{ id: 'a1', val: 2 }]) // version locale modifiée
    mgr.setPlugins([{
      id: 'mock', label: 'Mock',
      readRemote: async () => remote,
      writeRemote: async (_store: string, merged: any[]) => { pushed['activities'] = merged }
    }])
    await svc.syncStores([{ store: 'activities', key: '' }])
    expect(pushed['activities']).toBeTruthy()
    // la version locale (val:2) doit être dans merged
    expect(pushed['activities'].some(i => i.id === 'a1' && i.val === 2)).toBe(true)
  })
})
