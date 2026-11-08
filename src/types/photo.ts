import type { Timestamped } from './activity'

/** Store of the photos' descriptions: small rows, one per photo. */
export const PHOTO_STORE = 'activity_photos'
/** Store of the images themselves, kept apart so listing never loads them. */
export const PHOTO_BLOB_STORE = 'photo_blobs'

/** How many photos one outing holds: a story, not a camera roll. */
export const MAX_PHOTOS_PER_ACTIVITY = 10

/** Longest edge of the stored image, px: sharp on a phone, light on a quota. */
export const PHOTO_MAX_EDGE = 2048
/** Longest edge of the thumbnail the strip and the feed show, px. */
export const THUMB_MAX_EDGE = 640

/**
 * A photo attached to one of the reader's outings.
 *
 * The image is re-encoded on the way in, which drops its EXIF block — and the
 * GPS position a phone writes there with it. Only the time it was taken is
 * read beforehand, to keep the photos in the order of the outing.
 */
export interface ActivityPhoto extends Timestamped {
  activityId: string
  /** When the photo was taken (EXIF), else when the file was last changed, ms. */
  takenAt: number
  /** When it was added here, ms; breaks ties between photos of the same second. */
  addedAt: number
  width: number
  height: number
  mime: string
  /** Bytes of the stored image, thumbnail excluded. */
  size: number
  /**
   * Where each storage provider keeps the two images, by plugin id: the file
   * ids another device downloads them from. Absent until uploaded; emptied
   * once the files of a deleted photo are gone from the provider.
   */
  remote?: Record<string, RemotePhotoFiles>
}

/** A photo's two images as files of one storage provider. */
export interface RemotePhotoFiles {
  full: string
  thumb: string
}

/**
 * What `photo_blobs` holds for a photo, under the same id. Both images on the
 * device that took the photo; on another one, only those downloaded so far.
 */
export interface PhotoBlobs {
  id: string
  full?: Blob
  thumb?: Blob
}

export type PhotoSize = 'thumb' | 'full'

/** What came of adding a batch of files. */
export interface PhotoAddResult {
  added: ActivityPhoto[]
  /** Files that could not be read as an image (a HEIC on a browser that cannot decode it…). */
  failed: number
  /** Files left out because the outing already held its maximum. */
  refused: number
}

/** Photos in the order the outing went: taken first, shown first. */
export function sortPhotos<T extends Pick<ActivityPhoto, 'takenAt' | 'addedAt'>>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.takenAt - b.takenAt || a.addedAt - b.addedAt)
}
