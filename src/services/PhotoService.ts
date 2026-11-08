import { IndexedDBService } from './IndexedDBService'
import { getActivityService, type ActivityServiceEvent } from './ActivityService'
import { processPhoto, type ProcessedPhoto } from '@/utils/photoImage'
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
 * A row per photo in `activity_photos`, versioned and soft-deleted like the
 * rest so it can sync later; the images in `photo_blobs`, under the same id,
 * so that listing an outing's photos never loads a megabyte. Both stores stay
 * on the device for now (LOCAL_ONLY_STORES): images do not belong in the JSON
 * backup, and travel as files of their own once sync carries them.
 */
export class PhotoService {
  private static instance: PhotoService
  public emitter = new EventTarget()
  /** Swappable in tests, where no canvas can encode a JPEG. */
  public process: (file: File) => Promise<ProcessedPhoto> = processPhoto

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

  private emit(activityId: string): void {
    this.emitter.dispatchEvent(
      new CustomEvent<PhotoServiceEvent>('photos-changed', {
        detail: { type: 'photos-changed', activityId }
      })
    )
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

  /** The image of a photo, or null once it is gone. */
  public async blob(photoId: string, size: PhotoSize): Promise<Blob | null> {
    const db = await this.db()
    const record = await db.getDataFromStore<PhotoBlobs>(PHOTO_BLOB_STORE, photoId)
    return record?.[size] ?? null
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

  /** Subscribe to an outing's photos changing; returns the unsubscribe. */
  public onChanged(handler: (activityId: string) => void): () => void {
    const listener = (event: Event) =>
      handler((event as CustomEvent<PhotoServiceEvent>).detail.activityId)
    this.emitter.addEventListener('photos-changed', listener)
    return () => this.emitter.removeEventListener('photos-changed', listener)
  }
}

export function getPhotoService(): PhotoService {
  return PhotoService.getInstance()
}
