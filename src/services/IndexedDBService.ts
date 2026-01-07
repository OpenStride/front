
export class IndexedDBService {
  private static instance: IndexedDBService | null = null;
  private db: IDBDatabase | null = null;
  public emitter = new EventTarget();

  public static async getInstance(): Promise<IndexedDBService> {
    if (!IndexedDBService.instance) {
      console.log('[IndexedDBService] Initialisation de la DB...');
      const service = new IndexedDBService();
      await service.initDB();
      IndexedDBService.instance = service;
      console.log('[IndexedDBService] Instance prête ✅');
    }
    return IndexedDBService.instance;
  }

  private async getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    if (!this.db) {
      console.warn(`[IndexedDBService] DB fermée, tentative de réouverture...`);
      await this.initDB();
      if (!this.db) throw new Error("Impossible de rouvrir la DB");
    }

    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  public async getObjectStoresNames(): Promise<string[]> {
    return this.db?.objectStoreNames ? Array.from(this.db.objectStoreNames) : [];
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("OpenStrideDB", 7);

      const objectStores: { name: string; options?: IDBObjectStoreParameters }[] = [
        { name: "settings", options: { keyPath: "key" } },
        { name: "activities" }, // no keyPath
        { name: "activity_details" },
        { name: "notifLogs", options: { autoIncrement: true } },
        { name: "aggregatedData", options: { keyPath: "id" } }, // new store for metrics
      ];

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        for (const { name, options } of objectStores) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, options);
          }
        }
      };

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log("✅ IndexedDB initialisée !");
        resolve();
      };

      request.onerror = (event: Event) => {
        console.error("❌ Erreur IndexedDB:", (event.target as IDBOpenDBRequest).error);
        reject(event.target);
      };
    });
  }

  async exportDB(table: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized");

      const transaction = this.db.transaction(table, "readonly");
      const store = transaction.objectStore(table);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteData(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized");

      const transaction = this.db.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      const request = store.delete(key);

      request.onsuccess = () => {
        this.emitter.dispatchEvent(new CustomEvent('dbChange', {
          detail: { store: 'settings', key }
        }));
        resolve();
      };
    });
  }

  async saveData(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized");

      const transaction = this.db.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      store.put({ key, value });

      transaction.oncomplete = () => {
        this.emitter.dispatchEvent(new CustomEvent('dbChange', {
          detail: { store: 'settings', key }
        }));
        resolve();
      };
    });
  }

  async getData(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized");

      const transaction = this.db.transaction("settings", "readonly");
      const store = transaction.objectStore("settings");
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result ? request.result.value : null);
    });
  }
  /* 
    async getActivities({ offset = 0, limit = 10 }): Promise<any[]> {
      const all = await this.getAllData("activity_details");
      const sorted = all.sort((a, b) => b.startTime - a.startTime); // startTime généralisé
      return sorted.slice(offset, offset + limit);
    } */

  public getAllData(storeName: string): Promise<any[]> {
    if (!this.db) throw new Error("DB not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getDataFromStore(storeName: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("DB not initialized");

      const transaction = this.db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  /* 
    async saveActivities(activities: any[]): Promise<void> {
      if (!this.db) throw new Error("DB not initialized");
  
      return new Promise((resolve, reject) => {
        const tx = this.db!.transaction("activities", "readwrite");
        const store = tx.objectStore("activities");
  
        let pending = activities.length;
        if (pending === 0) resolve();
  
        activities.forEach((activity) => {
          const keyId = activity.id;
          const getReq = store.get(keyId);
  
          getReq.onsuccess = () => {
            if (!getReq.result) {
              store.add(activity, keyId);
            }
            this.emitter.dispatchEvent(new CustomEvent('dbChange', {
              detail: { store: 'activities' }
            }));
            if (--pending === 0) resolve();
          };
  
          getReq.onerror = () => {
            console.error(`Erreur lors de la vérif de l’activité ${activity.id}`);
            if (--pending === 0) resolve(); // ignorer l’erreur ponctuelle
          };
        });
  
        tx.onerror = () => reject(tx.error);
      });
    } */
  /* 
    async saveActivityDetails(details: any[]): Promise<void> {
      if (!this.db) throw new Error("DB not initialized");
  
      return new Promise((resolve, reject) => {
        const tx = this.db!.transaction("activity_details", "readwrite");
        const store = tx.objectStore("activity_details");
  
        let pending = details.length;
        if (pending === 0) resolve();
  
        details.forEach((activity) => {
          const keyId = activity.id;
          const getReq = store.get(keyId);
  
          getReq.onsuccess = () => {
            if (!getReq.result) {
              store.add(activity, keyId);
            }
            if (--pending === 0) resolve();
          };
  
          getReq.onerror = () => {
            console.error(`Erreur lors de la vérif de l’activité ${activity.id}`);
            if (--pending === 0) resolve();
          };
        });
  
        tx.onerror = () => reject(tx.error);
      });
    } */

  public async addItemsToStore<T>(
    storeName: string,
    items: T[],
    keyFn?: (item: T) => IDBValidKey
  ): Promise<void> {
    if (!this.db) throw new Error("DB not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(storeName, "readwrite");
      const os = tx.objectStore(storeName);
      const usesInlineKeys = os.keyPath !== null;

      for (const item of items) {
        if (keyFn && !usesInlineKeys) {
          os.put(item, keyFn(item));
        } else {
          // If the store uses inline keys and we can infer the keyPath, ensure item carries it
          if (usesInlineKeys && typeof os.keyPath === 'string') {
            const kp = os.keyPath as string;
            if (!(kp in (item as any)) && keyFn) {
              try { (item as any)[kp] = keyFn(item) as any; } catch { /* ignore */ }
            }
          }
          os.put(item);
        }
      }

      tx.oncomplete = () => {
        // Notify listeners that this store changed (used by Backup/Storage listeners)
        try {
          this.emitter.dispatchEvent(new CustomEvent('dbChange', {
            detail: { store: storeName, key: '' }
          }));
        } catch (_) { /* no-op */ }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }


public async clearStore(storeName: string): Promise<void> {
    if (!this.db) throw new Error("DB not initialized");
    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => {
        this.emitter.dispatchEvent(new CustomEvent('dbChange', {
          detail: { store: storeName, cleared: true }
        }));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}


// ✅ Export singleton utilitaire
export async function getIndexedDBService(): Promise<IndexedDBService> {
  return await IndexedDBService.getInstance();
}
