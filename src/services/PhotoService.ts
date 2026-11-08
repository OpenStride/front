import { IndexedDBService } from './IndexedDBService'
import { getActivityService, type ActivityServiceEvent } from './ActivityService'
import { StoragePluginManager } from './StoragePluginManager'
import { processPhoto, type ProcessedPhoto } from '@/utils/photoImage'
import type { StoragePlugin } from '@/types/storage'
import {
  MAX_PHOTOS_PER_ACTIVITY,
  PHOTO_BLOB_STORE,
  PHOTO_STORE,
  sortPhotos,
  type ActivityPhoto,
  type PhotoAddResult,
  type PhotoBlobs,
  type PhotoSize
} from '@/types/photo'

export interface PhotoServiceEvent {
  type: 'photos-changed'
  activityId: string
  /** 'remote' when a sync brought the change: nothing new to push back. */
  source: 'local' | 'remote'
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The photos of the reader's outings.
 *
 * A row per photo in `activity_photos`, versioned and soft-deleted, synced by
 * SyncService like the gear; the images in `photo_blobs`, under the same id,
 * so that listing an outing's photos never loads a megabyte. Images never go
 * into the JSON backup: each one is a file of its own at the storage provider
 * (`remote` on the row), uploaded at sync time and downloaded by another
 * device only when it has to show it.
 */
export class PhotoService {
  private static instance: PhotoService
  public emitter = new EventTarget()
  /** Swappable in tests, where no canvas can encode a JPEG. */
  public process: (file: File) => Promise<ProcessedPhoto> = processPhoto
  /** The storage providers to download images from; swappable in tests. */
  public storagePlugins: () => Promise<StoragePlugin[]> = () =>
    StoragePluginManager.getInstance().getMyStoragePlugins()
  /** Downloads under way, so two views of one photo fetch it once. */
  private downloads = new Map<string, Promise<Blob | null>>()

  public static getInstance(): PhotoService {
    if (!PhotoService.instance) PhotoService.instance = new PhotoService()
    return PhotoService.instance
  }

  private constructor() {
    // An outing that goes takes its photos with it: nothing would ever show
    // them again, and they are the heaviest thing it leaves behind.
    getActivityService()
      .then(service =>
        service.emitter.addEventListener('activity-changed', event => {
          const detail = (event as CustomEvent<ActivityServiceEvent>).detail
          if (detail.type === 'deleted') void this.removeAllFor(detail.activity.id)
        })
      )
      .catch(() => {
        /* no activity service (tests): nothing to follow */
      })
  }

  private async db() {
    return IndexedDBService.getInstance()
  }

  private emit(activityId: string, source: 'local' | 'remote' = 'local'): void {
    this.emitter.dispatchEvent(
      new CustomEvent<PhotoServiceEvent>('photos-changed', {
        detail: { type: 'photos-changed', activityId, source }
      })
    )
  }

  private async write(rows: ActivityPhoto[]): Promise<void> {
    const db = await this.db()
    await db.addItemsToStore(PHOTO_STORE, rows, r => r.id)
  }

  /** Every row of an outing, tombstones included. */
  private async rowsOf(activityId: string): Promise<ActivityPhoto[]> {
    const db = await this.db()
    return db.getAllFromIndex<ActivityPhoto>(PHOTO_STORE, 'activityId', activityId)
  }

  /** An outing's live photos, in the order it went. */
  public async list(activityId: string): Promise<ActivityPhoto[]> {
    return sortPhotos((await this.rowsOf(activityId)).filter(p => !p.deleted))
  }

  /**
   * Add picked files to an outing, in the order they were taken. Files past
   * the outing's maximum are refused rather than silently dropped, and a file
   * the browser cannot decode is counted, not thrown: one bad file in a batch
   * must not cost the others.
   */
  public async add(activityId: string, files: File[]): Promise<PhotoAddResult> {
    const room = Math.max(0, MAX_PHOTOS_PER_ACTIVITY - (await this.list(activityId)).length)
    const accepted = files.slice(0, room)
    const result: PhotoAddResult = { added: [], failed: 0, refused: files.length - accepted.length }

    const rows: ActivityPhoto[] = []
    const blobs: PhotoBlobs[] = []
    for (const file of accepted) {
      try {
        const processed = await this.process(file)
        const now = Date.now()
        const id = newId()
        rows.push({
          id,
          activityId,
          takenAt: processed.takenAt,
          addedAt: now,
          width: processed.width,
          height: processed.height,
          mime: processed.full.type || 'image/jpeg',
          size: processed.full.size,
          version: 1,
          lastModified: now,
          synced: false
        })
        blobs.push({ id, full: processed.full, thumb: processed.thumb })
      } catch (error) {
        console.warn('[PhotoService] Could not read a picked file:', error)
        result.failed += 1
      }
    }

    if (rows.length) {
      const db = await this.db()
      // Images first: a row never points at an image that is not there
      await db.addItemsToStore(PHOTO_BLOB_STORE, blobs, b => b.id)
      await db.addItemsToStore(PHOTO_STORE, rows, r => r.id)
      result.added = sortPhotos(rows)
      this.emit(activityId)
    }
    return result
  }

  /**
   * The image of a photo, or null once it is gone. Read from the device when
   * it is there, else downloaded from the storage provider that holds it and
   * kept, so it is fetched once per device.
   */
  public async blob(photoId: string, size: PhotoSize): Promise<Blob | null> {
    const db = await this.db()
    const record = await db.getDataFromStore<PhotoBlobs>(PHOTO_BLOB_STORE, photoId)
    const local = record?.[size]
    if (local) return local

    const key = `${photoId}:${size}`
    let pending = this.downloads.get(key)
    if (!pending) {
      pending = this.download(photoId, size).finally(() => this.downloads.delete(key))
      this.downloads.set(key, pending)
    }
    return pending
  }

  private async download(photoId: string, size: PhotoSize): Promise<Blob | null> {
    const db = await this.db()
    const row = await db.getDataFromStore<ActivityPhoto>(PHOTO_STORE, photoId)
    if (!row || row.deleted || !row.remote) return null

    let plugins: StoragePlugin[] = []
    try {
      plugins = await this.storagePlugins()
    } catch {
      return null
    }
    for (const plugin of plugins) {
      const files = row.remote[plugin.id]
      if (!files || !plugin.readFile) continue
      try {
        const blob = await plugin.readFile(files[size])
        if (!blob) continue
        // Re-read: the other size may have landed meanwhile
        const current = await db.getDataFromStore<PhotoBlobs>(PHOTO_BLOB_STORE, photoId)
        await db.addItemsToStore(
          PHOTO_BLOB_STORE,
          [{ ...(current ?? {}), id: photoId, [size]: blob }],
          b => b.id
        )
        return blob
      } catch (error) {
        console.warn(`[PhotoService] Could not download a photo from ${plugin.label}:`, error)
      }
    }
    return null
  }

  /** Soft delete: the row stays as a tombstone, the image goes now. */
  public async remove(photoId: string): Promise<boolean> {
    const db = await this.db()
    const row = await db.getDataFromStore<ActivityPhoto>(PHOTO_STORE, photoId)
    if (!row || row.deleted) return false
    await db.addItemsToStore(PHOTO_STORE, [this.tombstone(row)], r => r.id)
    await db.deleteFromStore(PHOTO_BLOB_STORE, photoId)
    this.emit(row.activityId)
    return true
  }

  /** Every photo of an outing, as when the outing itself is deleted. */
  public async removeAllFor(activityId: string): Promise<number> {
    const live = (await this.rowsOf(activityId)).filter(p => !p.deleted)
    if (!live.length) return 0
    const db = await this.db()
    await db.addItemsToStore(
      PHOTO_STORE,
      live.map(p => this.tombstone(p)),
      r => r.id
    )
    await db.deleteMultipleFromStore(
      PHOTO_BLOB_STORE,
      live.map(p => p.id)
    )
    this.emit(activityId)
    return live.length
  }

  private tombstone(row: ActivityPhoto): ActivityPhoto {
    return {
      ...row,
      deleted: true,
      version: row.version + 1,
      lastModified: Date.now(),
      synced: false
    }
  }

  /**
   * Subscribe to an outing's photos changing; returns the unsubscribe.
   * `source` says whether the change was made here or brought by a sync.
   */
  public onChanged(handler: (activityId: string, source: 'local' | 'remote') => void): () => void {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PhotoServiceEvent>).detail
      handler(detail.activityId, detail.source)
    }
    this.emitter.addEventListener('photos-changed', listener)
    return () => this.emitter.removeEventListener('photos-changed', listener)
  }

  // ── Sync (SyncService) ──────────────────────────────────────────────────────

  /** Every row, tombstones included — what sync reads. */
  public async listAll(): Promise<ActivityPhoto[]> {
    const db = await this.db()
    return (await db.getAllData<ActivityPhoto>(PHOTO_STORE)) ?? []
  }

  public async markAsSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const wanted = new Set(ids)
    const touched = (await this.listAll())
      .filter(p => wanted.has(p.id))
      .map(p => ({ ...p, synced: true }))
    if (touched.length > 0) await this.write(touched)
  }

  /**
   * Store rows pulled from a remote, as-is and marked synced. A photo deleted
   * elsewhere lets its image go here too; a new one is downloaded when shown.
   */
  public async applyRemote(records: ActivityPhoto[]): Promise<void> {
    if (records.length === 0) return
    await this.write(records.map(r => ({ ...r, synced: true })))
    const gone = records.filter(r => r.deleted).map(r => r.id)
    if (gone.length) {
      const db = await this.db()
      await db.deleteMultipleFromStore(PHOTO_BLOB_STORE, gone)
    }
    for (const activityId of new Set(records.map(r => r.activityId))) {
      this.emit(activityId, 'remote')
    }
  }

  /**
   * Upload the images this device holds and `plugin` does not, before the rows
   * are pushed: a row then reaches another device already saying where its
   * images are. A failed upload leaves the row as it was, for the next sync.
   */
  public async uploadPending(
    plugin: StoragePlugin
  ): Promise<{ uploaded: number; errors: string[] }> {
    if (!plugin.writeFile) return { uploaded: 0, errors: [] }
    const db = await this.db()
    const pending = (await this.listAll()).filter(p => !p.deleted && !p.remote?.[plugin.id])
    const errors: string[] = []
    const done: ActivityPhoto[] = []

    for (const photo of pending) {
      const images = await db.getDataFromStore<PhotoBlobs>(PHOTO_BLOB_STORE, photo.id)
      // Not taken here, and not downloaded yet: the device that has it uploads it
      if (!images?.full || !images.thumb) continue
      const full = await plugin.writeFile(`${photo.id}.jpg`, images.full)
      const thumb = full ? await plugin.writeFile(`${photo.id}_thumb.jpg`, images.thumb) : null
      if (!full || !thumb) {
        // Half an upload is no upload: the next round starts over cleanly
        if (full) await plugin.deleteFile?.(full)
        errors.push(`Failed to upload photo ${photo.id} to ${plugin.label}`)
        continue
      }
      done.push({
        ...photo,
        remote: { ...(photo.remote ?? {}), [plugin.id]: { full, thumb } },
        version: photo.version + 1,
        lastModified: Date.now(),
        synced: false
      })
    }
    if (done.length) await this.write(done)
    return { uploaded: done.length, errors }
  }

  /**
   * Delete from `plugin` the files of photos deleted since, then forget them on
   * the row — a version later, so every device learns there is nothing left.
   */
  public async purgeRemote(plugin: StoragePlugin): Promise<{ purged: number; errors: string[] }> {
    if (!plugin.deleteFile) return { purged: 0, errors: [] }
    const stale = (await this.listAll()).filter(p => p.deleted && p.remote?.[plugin.id])
    const errors: string[] = []
    const done: ActivityPhoto[] = []

    for (const photo of stale) {
      const files = photo.remote![plugin.id]
      const removed =
        (await plugin.deleteFile(files.full)) && (await plugin.deleteFile(files.thumb))
      if (!removed) {
        errors.push(`Failed to delete the files of photo ${photo.id} from ${plugin.label}`)
        continue
      }
      const { [plugin.id]: _gone, ...rest } = photo.remote!
      done.push({
        ...photo,
        remote: rest,
        version: photo.version + 1,
        lastModified: Date.now(),
        synced: false
      })
    }
    if (done.length) await this.write(done)
    return { purged: done.length, errors }
  }
}

export function getPhotoService(): PhotoService {
  return PhotoService.getInstance()
}
