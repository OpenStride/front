import { vi } from 'vitest'

/**
 * Shared FakeDB helper for tests.
 *
 * Provides an in-memory mock of IndexedDBService with the same API.
 * Usage:
 *   vi.mock('@/services/IndexedDBService', () => createFakeDBModule())
 *
 *   // In beforeEach:
 *   const { IndexedDBService } = await import('@/services/IndexedDBService')
 *   const db = await IndexedDBService.getInstance()
 *   db.reset()
 */
export class FakeDB {
  public db: any
  private stores: Record<string, any[]> = {}
  private settings: Record<string, any> = {}
  public emitter = new EventTarget()

  static instance: FakeDB | null = null

  constructor() {
    this.db = {
      transaction: (storeNames: string | string[], mode: IDBTransactionMode) => {
        const names = Array.isArray(storeNames) ? storeNames : [storeNames]
        return this.getMockTransaction(names, mode)
      }
    }
  }

  static async getInstance(): Promise<FakeDB> {
    if (!FakeDB.instance) {
      FakeDB.instance = new FakeDB()
    }
    return FakeDB.instance
  }

  static resetInstance(): void {
    FakeDB.instance = null
  }

  getIDB() {
    return this.db
  }

  async getData(key: string): Promise<any> {
    return this.settings[key] ?? null
  }

  async saveData(key: string, value: any): Promise<void> {
    this.settings[key] = value
  }

  async deleteData(key: string): Promise<void> {
    delete this.settings[key]
  }

  async getAllData(store: string): Promise<any[]> {
    return [...(this.stores[store] || [])]
  }

  async getDataFromStore(store: string, id: string): Promise<any> {
    return this.stores[store]?.find((item: any) => item.id === id) || null
  }

  async exportDB(storeName: string): Promise<any[]> {
    return [...(this.stores[storeName] || [])]
  }

  async addItemsToStore(store: string, items: any[], keyFn?: (item: any) => any): Promise<void> {
    const existing = this.stores[store] || []
    const keyExtractor = keyFn || ((item: any) => item.id)

    for (const newItem of items) {
      const key = keyExtractor(newItem)
      const existingIndex = existing.findIndex((item: any) => keyExtractor(item) === key)

      if (existingIndex >= 0) {
        existing[existingIndex] = newItem
      } else {
        existing.push(newItem)
      }
    }

    this.stores[store] = existing
  }

  reset(): void {
    this.stores = {}
    this.settings = {}
  }

  /** Seed a store with data for testing */
  seed(store: string, items: any[]): void {
    this.stores[store] = [...items]
  }

  getMockTransaction(storeNames: string[], _mode: IDBTransactionMode) {
    const stores: Record<string, any> = {}
    let pendingOps = 0

    const checkComplete = (tx: any) => {
      if (pendingOps === 0) {
        setTimeout(() => {
          if (tx.oncomplete) tx.oncomplete()
        }, 0)
      }
    }

    for (const name of storeNames) {
      stores[name] = {
        put: vi.fn((item: any) => {
          const storeData = this.stores[name] || []
          const existing = storeData.findIndex((i: any) => i.id === item.id)
          if (existing >= 0) {
            storeData[existing] = item
          } else {
            storeData.push(item)
          }
          this.stores[name] = storeData
        }),
        get: vi.fn((id: string) => {
          pendingOps++
          const storeData = this.stores[name] || []
          const item = storeData.find((i: any) => i.id === id)
          const req = {
            result: item,
            onsuccess: null as any
          }
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess()
            pendingOps--
            checkComplete(tx)
          }, 0)
          return req
        })
      }
    }

    const tx = {
      objectStore: vi.fn((name: string) => stores[name]),
      oncomplete: null as any,
      onerror: null as any,
      error: null
    }

    setTimeout(() => checkComplete(tx), 1)

    return tx
  }
}

/**
 * Creates the mock module object for vi.mock('@/services/IndexedDBService', ...)
 */
export function createFakeDBModule() {
  return {
    IndexedDBService: FakeDB,
    getIndexedDBService: () => FakeDB.getInstance()
  }
}
