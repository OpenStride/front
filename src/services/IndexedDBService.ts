import type { IStorageService } from '@/types/plugin-context'

/**
 * IndexedDB service for local data storage
 *
 * Implements IStorageService for plugin dependency injection.
 * Provides low-level database access for settings, activities, and aggregations.
 */
export class IndexedDBService implements IStorageService {
  private static instance: IndexedDBService | null = null
  private db: IDBDatabase | null = null
  public emitter = new EventTarget()

  public static async getInstance(): Promise<IndexedDBService> {
    if (!IndexedDBService.instance) {
      console.log('[IndexedDBService] Initialisation de la DB...')
      const service = new IndexedDBService()
      await service.initDB()
      IndexedDBService.instance = service
      console.log('[IndexedDBService] Instance prête ✅')
    }
    return IndexedDBService.instance
  }

  /**
   * Get the raw IDBDatabase handle for advanced multi-store transactions.
   * Used by ActivityService for atomic writes across stores.
   */
  public getIDB(): IDBDatabase {
    if (!this.db) throw new Error('DB not initialized')
    return this.db
  }

  private async getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    if (!this.db) {
      console.warn(`[IndexedDBService] DB fermée, tentative de réouverture...`)
      await this.initDB()
      if (!this.db) throw new Error('Impossible de rouvrir la DB')
    }

    const tx = this.db.transaction(storeName, mode)
    return tx.objectStore(storeName)
  }

  public async getObjectStoresNames(): Promise<string[]> {
    return this.db?.objectStoreNames ? Array.from(this.db.objectStoreNames) : []
  }

  /**
   * EMERGENCY: Delete entire database and recreate from scratch
   * Use this if migration is stuck
   */
  public static async resetDatabase(): Promise<void> {
    console.warn('[IndexedDBService] 🔥 RESET: Deleting entire database...')

    // Close existing connection
    if (IndexedDBService.instance?.db) {
      IndexedDBService.instance.db.close()
    }
    IndexedDBService.instance = null

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase('OpenStrideDB')

      deleteRequest.onsuccess = () => {
        console.log('[IndexedDBService] ✅ Database deleted successfully')
        resolve()
      }

      deleteRequest.onerror = () => {
        console.error('[IndexedDBService] ❌ Error deleting database')
        reject(deleteRequest.error)
      }

      deleteRequest.onblocked = () => {
        console.warn('[IndexedDBService] ⚠️ Database deletion blocked. Close all tabs.')
      }
    })
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('OpenStrideDB', 10)

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result
        const oldVersion = event.oldVersion

        console.log(`[IndexedDBService] Migration from v${oldVersion} to v10`)

        // Migration from v8 to v9: SIMPLIFIED - just recreate stores
        // Users can re-import data from Google Drive or providers
        if (oldVersion > 0 && oldVersion < 9) {
          console.warn(
            '[IndexedDBService] Migration v8→v9 requires fresh start. Please re-import your data.'
          )

          // Delete old stores if they exist
          if (db.objectStoreNames.contains('activities')) {
            db.deleteObjectStore('activities')
          }
          if (db.objectStoreNames.contains('activity_details')) {
            db.deleteObjectStore('activity_details')
          }
        }

        // Create missing stores (for fresh install or migration)
        const objectStores: {
          name: string
          options?: IDBObjectStoreParameters
          indices?: { name: string; keyPath: string; unique: boolean }[]
        }[] = [
          { name: 'settings', options: { keyPath: 'key' } },
          {
            name: 'activities',
            options: { keyPath: 'id' },
            indices: [
              { name: 'startTime', keyPath: 'startTime', unique: false },
              { name: 'deleted', keyPath: 'deleted', unique: false },
              { name: 'synced', keyPath: 'synced', unique: false },
              { name: 'provider', keyPath: 'provider', unique: false }
            ]
          },
          {
            name: 'activity_details',
            options: { keyPath: 'id' }
          },
          { name: 'notifLogs', options: { autoIncrement: true } },
          { name: 'aggregatedData', options: { keyPath: 'id' } },
          { name: 'friends', options: { keyPath: 'id' } },
          { name: 'friend_activities', options: { keyPath: 'id' } },
          {
            name: 'interactions',
            options: { keyPath: 'id' },
            indices: [
              { name: 'activityId', keyPath: 'activityId', unique: false },
              { name: 'activityOwnerId', keyPath: 'activityOwnerId', unique: false },
              { name: 'authorId', keyPath: 'authorId', unique: false },
              { name: 'timestamp', keyPath: 'timestamp', unique: false }
            ]
          }
        ]

        for (const { name, options, indices } of objectStores) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, options)
            if (indices) {
              indices.forEach(index => {
                store.createIndex(index.name, index.keyPath, { unique: index.unique })
              })
            }
          }
        }
      }

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result
        console.log('✅ IndexedDB initialisée !')
        resolve()
      }

      request.onerror = (event: Event) => {
        console.error('❌ Erreur IndexedDB:', (event.target as IDBOpenDBRequest).error)
        reject(event.target)
      }
    })
  }

  async exportDB(table: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'))

      const transaction = this.db.transaction(table, 'readonly')
      const store = transaction.objectStore(table)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error(`exportDB failed for "${table}": ${request.error}`))
      transaction.onerror = () =>
        reject(new Error(`exportDB transaction failed for "${table}": ${transaction.error}`))
    })
  }

  async deleteData(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'))

      const transaction = this.db.transaction('settings', 'readwrite')
      const store = transaction.objectStore('settings')
      const request = store.delete(key)

      request.onsuccess = () => {
        this.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: 'settings', key }
          })
        )
        resolve()
      }
      request.onerror = () => reject(new Error(`deleteData failed for "${key}": ${request.error}`))
      transaction.onerror = () =>
        reject(new Error(`deleteData transaction failed for "${key}": ${transaction.error}`))
    })
  }

  async saveData(key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'))

      const transaction = this.db.transaction('settings', 'readwrite')
      const store = transaction.objectStore('settings')
      store.put({ key, value })

      transaction.oncomplete = () => {
        this.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: 'settings', key }
          })
        )
        resolve()
      }
      transaction.onerror = () =>
        reject(new Error(`saveData transaction failed for "${key}": ${transaction.error}`))
    })
  }

  async getData(key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'))

      const transaction = this.db.transaction('settings', 'readonly')
      const store = transaction.objectStore('settings')
      const request = store.get(key)

      request.onsuccess = () => resolve(request.result ? request.result.value : null)
      request.onerror = () => reject(new Error(`getData failed for "${key}": ${request.error}`))
      transaction.onerror = () =>
        reject(new Error(`getData transaction failed for "${key}": ${transaction.error}`))
    })
  }

  public getAllData(storeName: string): Promise<unknown[]> {
    if (!this.db) throw new Error('DB not initialized')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getDataFromStore(storeName: string, key: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'))

      const transaction = this.db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  public async addItemsToStore<T>(
    storeName: string,
    items: T[],
    keyFn?: (item: T) => IDBValidKey
  ): Promise<void> {
    if (!this.db) throw new Error('DB not initialized')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const os = tx.objectStore(storeName)
      const usesInlineKeys = os.keyPath !== null

      for (const item of items) {
        if (keyFn && !usesInlineKeys) {
          os.put(item, keyFn(item))
        } else {
          // If the store uses inline keys and we can infer the keyPath, ensure item carries it
          if (usesInlineKeys && typeof os.keyPath === 'string') {
            const kp = os.keyPath as string
            if (!(kp in (item as Record<string, unknown>)) && keyFn) {
              try {
                ;(item as Record<string, unknown>)[kp] = keyFn(item)
              } catch {
                /* ignore */
              }
            }
          }
          os.put(item)
        }
      }

      tx.oncomplete = () => {
        // Notify listeners that this store changed (used by Backup/Storage listeners)
        try {
          this.emitter.dispatchEvent(
            new CustomEvent('dbChange', {
              detail: { store: storeName, key: '' }
            })
          )
        } catch {
          /* no-op */
        }
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  }

  /**
   * Delete a single item from a store by key
   */
  public async deleteFromStore(storeName: string, key: IDBValidKey): Promise<void> {
    if (!this.db) throw new Error('DB not initialized')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.delete(key)

      request.onsuccess = () => {
        this.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: storeName, key }
          })
        )
        resolve()
      }

      request.onerror = () => reject(request.error)
      tx.onerror = () => reject(tx.error)
    })
  }

  /**
   * Delete multiple items from a store by keys
   */
  public async deleteMultipleFromStore(storeName: string, keys: IDBValidKey[]): Promise<void> {
    if (!this.db) throw new Error('DB not initialized')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)

      for (const key of keys) {
        store.delete(key)
      }

      tx.oncomplete = () => {
        this.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: storeName, key: '' }
          })
        )
        resolve()
      }

      tx.onerror = () => reject(tx.error)
    })
  }

  public async clearStore(storeName: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized')
    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const request = store.clear()
      request.onsuccess = () => {
        this.emitter.dispatchEvent(
          new CustomEvent('dbChange', {
            detail: { store: storeName, cleared: true }
          })
        )
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }
}

// ✅ Export singleton utilitaire
export async function getIndexedDBService(): Promise<IndexedDBService> {
  return await IndexedDBService.getInstance()
}
