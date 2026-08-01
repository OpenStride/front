import { StoragePluginManager } from '@/services/StoragePluginManager'
import { IndexedDBService } from '@/services/IndexedDBService'

/** A generic record coming from or going to an IndexedDB object store. */
type StoreRecord = Record<string, unknown>

/**
 * Events emitted by StorageService
 */
export interface StorageServiceEvent {
  type: 'backup-started' | 'backup-completed' | 'backup-failed'
  changed?: boolean
  error?: Error
}

/**
 * Stores whose sync is owned by SyncService (version-based, conflict-aware).
 * StorageService must not touch them, to avoid two engines writing the same
 * remote files with divergent merge strategies.
 */
const SYNC_SERVICE_OWNED_STORES = ['activities', 'activity_details']

/**
 * Stores that never leave the device. They hold values derived from data that
 * is already synced, so uploading them would cost bandwidth for something we
 * can recompute. Losing them only costs a rebuild.
 */
const LOCAL_ONLY_STORES = ['activity_metrics']

export class StorageService {
  private static instance: StorageService
  private pluginManager = StoragePluginManager.getInstance()
  private suppressBackupsUntil = 0 // timestamp ms; while in hydration/import we ignore backup triggers
  private lastBackupToastAt = 0
  private backupInFlight = false // mutex: only one backup runs at a time
  private pendingBackupStores: Set<string> | null = null // coalesced follow-up run
  public emitter = new EventTarget()
  private constructor() {
    /* singleton */
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService()
    }
    return StorageService.instance
  }

  public async triggerBackup(details: Array<{ store: string; key: string }>): Promise<void> {
    console.log('🔧 Backup triggered')
    if (Date.now() < this.suppressBackupsUntil) {
      console.log('[StorageService] Backup suppressed (hydration phase)')
      return
    }
    // Filter out internal summary key to prevent feedback loop
    details = details.filter(
      d => !(d.store === 'settings' && d.key === 'lastStorageManifestSummary')
    )
    if (details.length === 0) return // nothing meaningful

    // Coalesce: if a backup is already running, queue the stores for a single
    // follow-up run instead of overlapping (prevents flood on setting bursts).
    if (this.backupInFlight) {
      this.pendingBackupStores ??= new Set<string>()
      details.forEach(d => this.pendingBackupStores!.add(d.store))
      console.log('[StorageService] Backup already running, coalescing request')
      return
    }

    this.backupInFlight = true
    try {
      await this.runBackup(details)

      // Drain any requests that arrived while we were running (one extra pass)
      while (this.pendingBackupStores && this.pendingBackupStores.size > 0) {
        const stores = [...this.pendingBackupStores]
        this.pendingBackupStores = null
        await this.runBackup(stores.map(store => ({ store, key: '' })))
      }
    } finally {
      this.backupInFlight = false
    }
  }

  private async runBackup(details: Array<{ store: string; key: string }>): Promise<void> {
    try {
      let uniqueStores = Array.from(new Set(details.map(detail => detail.store)))

      // If storage plugin enablement changed, perform a full sync of all known stores
      const pluginChanged = details.some(
        d => d.store === 'settings' && d.key === 'enabledStoragePlugins'
      )
      if (pluginChanged) {
        try {
          const db = await IndexedDBService.getInstance()
          const allStores = await db.getObjectStoresNames()
          uniqueStores = Array.from(new Set([...uniqueStores, ...allStores]))
          console.log('🔁 Full sync triggered due to storage plugin change')
        } catch {
          /* ignore */
        }
      }

      // Never touch stores owned by SyncService (activities / activity_details),
      // nor the device-local derived stores
      uniqueStores = uniqueStores.filter(
        s => !SYNC_SERVICE_OWNED_STORES.includes(s) && !LOCAL_ONLY_STORES.includes(s)
      )
      if (uniqueStores.length === 0) return

      const changed = await this.syncStores(uniqueStores.map(store => ({ store, key: '' })))
      console.log('✅ Backup completed')

      // Emit backup-completed event instead of showing toast directly
      if (changed && Date.now() - this.lastBackupToastAt > 1500) {
        this.emitter.dispatchEvent(
          new CustomEvent<StorageServiceEvent>('backup-completed', {
            detail: { type: 'backup-completed', changed: true }
          })
        )
        this.lastBackupToastAt = Date.now()
      }
    } catch (error) {
      console.error('❌ Backup failed:', error)

      // Emit backup-failed event instead of showing toast directly
      this.emitter.dispatchEvent(
        new CustomEvent<StorageServiceEvent>('backup-failed', {
          detail: { type: 'backup-failed', error: error as Error }
        })
      )
    }
  }

  public async syncStores(details: Array<{ store: string; key: string }>): Promise<boolean> {
    const plugins = await this.pluginManager.getMyStoragePlugins()
    const dbService = await IndexedDBService.getInstance()

    const uniqueStores = Array.from(new Set(details.map(d => d.store)))
    let anyChanges = false

    for (const plugin of plugins) {
      console.log(`🔄 Sync with ${plugin.label}`)
      for (const store of uniqueStores) {
        const keyFn = (item: StoreRecord) =>
          (item.key as string) ||
          (item.id as string) ||
          (item.activityId as string) ||
          JSON.stringify(item)
        const stripLM = (obj: unknown) => {
          if (!obj || typeof obj !== 'object') return obj
          const { lastModified: _lm, ...rest } = obj as StoreRecord
          return rest
        }
        const isDifferent = (a: unknown, b: unknown) => {
          if (!a && b) return true
          if (!b && a) return true
          return JSON.stringify(stripLM(a)) !== JSON.stringify(stripLM(b))
        }

        try {
          const localData = (await dbService.exportDB(store)) as StoreRecord[]
          const remoteData = (await plugin.readRemote(store)) as StoreRecord[]

          const localMap = new Map(localData.map((item: StoreRecord) => [keyFn(item), item]))
          const remoteMap = new Map(remoteData.map((item: StoreRecord) => [keyFn(item), item]))

          // ➕ Nouveaux ou modifiés à envoyer à distance
          // ensure local items have lastModified
          const now = Date.now()
          localData.forEach((item: StoreRecord) => {
            if (item && typeof item === 'object' && item.lastModified == null)
              item.lastModified = now
          })
          const toRemote = [...localMap.entries()]
            .filter(([k, v]) => {
              const remoteVal = remoteMap.get(k)
              return !remoteVal || isDifferent(remoteVal, v)
            })
            .map(([, v]) => v)

          // ➕ Nouveaux distants à ramener localement
          const toLocal = [...remoteMap.entries()]
            .filter(([k]) => !localMap.has(k))
            .map(([, v]) => {
              if (v && typeof v === 'object' && v.lastModified == null) v.lastModified = now
              return v
            })

          console.log(
            `[StorageService][diff] store="${store}" local=${localData.length} remote=${remoteData.length} toLocal=${toLocal.length} toRemote=${toRemote.length}`
          )

          if (toLocal.length > 0) {
            await dbService.addItemsToStore(store, toLocal, keyFn)
            console.log(`📥 ${toLocal.length} items added to "${store}" from ${plugin.label}`)
            anyChanges = true
          }

          if (toRemote.length > 0) {
            const merged = [...remoteData.filter(item => !localMap.has(keyFn(item))), ...localData]
            // ensure merged items sorted deterministic (optional) by lastModified descending then key
            merged.forEach((m: StoreRecord) => {
              if (m && m.lastModified == null) m.lastModified = Date.now()
            })
            merged.sort(
              (a: StoreRecord, b: StoreRecord) =>
                ((b.lastModified as number) || 0) - ((a.lastModified as number) || 0)
            )
            await plugin.writeRemote(store, merged)
            console.log(`📤 ${toRemote.length} items written to remote store "${store}"`)
            anyChanges = true
          }
        } catch (err) {
          console.error(`❌ Sync failed for store "${store}" with ${plugin.label}`, err)
        }
      }
    }
    return anyChanges
  }

  /**
   * Import one-way FROM remote to local for given stores (or all) without pushing local changes.
   * Use after authentication to hydrate a fresh IndexedDB.
   */
  public async importFromRemote(stores?: string[]): Promise<void> {
    try {
      const plugins = await this.pluginManager.getMyStoragePlugins()
      if (!plugins.length) {
        console.log('[StorageService] importFromRemote: no storage plugins enabled')
        return
      }
      const db = await IndexedDBService.getInstance()
      let targetStores = stores && stores.length ? stores : await db.getObjectStoresNames()
      targetStores = targetStores.filter(s =>
        ['activities', 'activity_details', 'settings', 'notifLogs'].includes(s)
      )
      const keyFn = (item: StoreRecord) =>
        (item.key as string) ||
        (item.id as string) ||
        (item.activityId as string) ||
        (item.activityIdSeconds as string) ||
        JSON.stringify(item)
      // Suppress backup triggers during hydration window
      this.suppressBackupsUntil = Date.now() + 1500
      for (const plugin of plugins) {
        console.log(
          `⬇️  Import from remote (${plugin.label}) for stores: ${targetStores.join(', ')}`
        )
        for (const store of targetStores) {
          try {
            const [localData, remoteData] = (await Promise.all([
              db.exportDB(store).catch(() => [] as StoreRecord[]),
              plugin.readRemote(store).catch(() => [] as StoreRecord[])
            ])) as [StoreRecord[], StoreRecord[]]
            if (!Array.isArray(remoteData) || remoteData.length === 0) continue
            const localMap = new Map<string, StoreRecord>(
              localData.map((i: StoreRecord) => [keyFn(i), i])
            )
            const toPut: StoreRecord[] = []
            const now = Date.now()
            for (const r of remoteData) {
              const k = keyFn(r)
              const existing = localMap.get(k)
              if (!existing || JSON.stringify(existing) !== JSON.stringify(r)) {
                if (r && typeof r === 'object' && r.lastModified == null) r.lastModified = now
                toPut.push(r)
              }
            }
            console.log(
              `[StorageService][import] store="${store}" remote=${remoteData.length} local=${localData.length} toPut=${toPut.length}`
            )
            if (toPut.length) {
              await db.addItemsToStore(store, toPut, keyFn)
              console.log(`📥 Imported ${toPut.length} remote items into local store "${store}"`)
            }
          } catch (err) {
            console.warn(
              `⚠️ importFromRemote failed for store ${store} with plugin ${plugin.id}`,
              err
            )
          }
        }
      }
      // allow some delay before re-enabling backups to let events flush
      setTimeout(() => {
        this.suppressBackupsUntil = 0
      }, 1600)
    } catch (e) {
      console.error('[StorageService] importFromRemote global failure', e)
    }
  }
}
