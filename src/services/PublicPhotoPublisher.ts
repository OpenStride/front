import { IndexedDBService } from './IndexedDBService'
import { PublicFileService } from './PublicFileService'
import { getPhotoService } from './PhotoService'
import { OWNER_SHARE_KEY } from '@/utils/publicCrypto'
import { bytesToBase64 } from '@/utils/base64'
import type { PublicImage, PublicPhoto } from '@/types/friend'

/**
 * Settings key of what has been published: each photo's two public files, and
 * the key they were sealed with. Replicated with the settings, so another of
 * the reader's devices does not upload them again.
 */
export const PUBLISHED_PHOTOS_KEY = 'publishedPhotos'

interface PublishedPhotos {
  key: string | null
  photos: Record<string, { thumb: string; full: string }>
}

const EMPTY: PublishedPhotos = { key: null, photos: {} }

/**
 * The photos a reader shares with their friends, as public files.
 *
 * Each photo is two files — the thumbnail a feed shows and the image the
 * viewer opens — holding the JPEG as base64 in a JSON envelope, so it goes
 * through `writePublicFile` and is sealed with the share key like every other
 * public file. A photo is uploaded once; publishing again only lists it.
 * The images were re-encoded when added, so no location travels with them.
 */
export class PublicPhotoPublisher {
  private static instance: PublicPhotoPublisher

  public static getInstance(): PublicPhotoPublisher {
    if (!PublicPhotoPublisher.instance) PublicPhotoPublisher.instance = new PublicPhotoPublisher()
    return PublicPhotoPublisher.instance
  }

  private async read(): Promise<PublishedPhotos> {
    const db = await IndexedDBService.getInstance()
    const stored = await db.getData<PublishedPhotos>(PUBLISHED_PHOTOS_KEY)
    return stored && typeof stored === 'object' && stored.photos ? stored : { ...EMPTY }
  }

  private async save(state: PublishedPhotos): Promise<void> {
    const db = await IndexedDBService.getInstance()
    await db.saveData(PUBLISHED_PHOTOS_KEY, state)
  }

  private async upload(name: string, blob: Blob): Promise<string | null> {
    const image: PublicImage = {
      mime: blob.type || 'image/jpeg',
      data: bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
    }
    return PublicFileService.getInstance().writePublicFile(name, image)
  }

  /**
   * The photos of these public outings, uploaded where they are not yet, by
   * outing. A photo that fails to upload is left out of this publication and
   * tried again at the next one.
   */
  public async publish(activityIds: string[]): Promise<Map<string, PublicPhoto[]>> {
    const db = await IndexedDBService.getInstance()
    const key = (await db.getData<string>(OWNER_SHARE_KEY)) ?? null
    let state = await this.read()
    // Sealed with another key, the files no friend can open any more: their
    // names are kept, so writing them again replaces them in place
    if (state.key !== key) state = { key, photos: {} }

    const service = getPhotoService()
    const links = new Map<string, PublicPhoto[]>()
    for (const activityId of activityIds) {
      const shared: PublicPhoto[] = []
      for (const photo of await service.list(activityId)) {
        let files = state.photos[photo.id]
        if (!files) {
          const thumbBlob = await service.blob(photo.id, 'thumb')
          const fullBlob = thumbBlob ? await service.blob(photo.id, 'full') : null
          if (!thumbBlob || !fullBlob) continue
          const thumb = await this.upload(`photo-${photo.id}-thumb.json`, thumbBlob)
          const full = thumb ? await this.upload(`photo-${photo.id}.json`, fullBlob) : null
          if (!thumb || !full) {
            console.warn(`[PublicPhotoPublisher] Could not publish photo ${photo.id}`)
            continue
          }
          files = { thumb, full }
          state.photos[photo.id] = files
          await this.save(state)
        }
        shared.push({ id: photo.id, ...files, width: photo.width, height: photo.height })
      }
      if (shared.length) links.set(activityId, shared)
    }
    await this.save(state)
    return links
  }

  /**
   * Delete the public files of every published photo not in `keep`: deleted
   * since, on an outing made private, or no longer shared at all. Run once the
   * new manifest is up, so no friend is pointed at a file that is gone.
   */
  public async prune(keep: Set<string>): Promise<void> {
    const state = await this.read()
    const files = PublicFileService.getInstance()
    let changed = false
    for (const [photoId, links] of Object.entries(state.photos)) {
      if (keep.has(photoId)) continue
      const ids = [links.thumb, links.full].map(url => files.extractFileIdFromUrl(url))
      let removed = true
      for (const id of ids) {
        if (id && !(await files.deleteFile(id))) removed = false
      }
      // Kept on failure, to try again at the next publication
      if (removed) {
        delete state.photos[photoId]
        changed = true
      }
    }
    if (changed) await this.save(state)
  }

  /** After the link changed: every public file is already gone. */
  public async forget(): Promise<void> {
    await this.save({ ...EMPTY })
  }
}

export function getPublicPhotoPublisher(): PublicPhotoPublisher {
  return PublicPhotoPublisher.getInstance()
}
