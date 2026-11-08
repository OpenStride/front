import { readExifDate } from './exifDate'
import { PHOTO_MAX_EDGE, THUMB_MAX_EDGE } from '@/types/photo'

/** Above this, the full image is encoded again at a lower quality. */
const FULL_TARGET_BYTES = 600 * 1024
const FULL_QUALITIES = [0.82, 0.72, 0.62]
const THUMB_QUALITY = 0.75

/** The size that fits `max` on its longest edge, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

type Drawable = ImageBitmap | HTMLImageElement

interface Decoded {
  image: Drawable
  width: number
  height: number
  release: () => void
}

/**
 * The picture, upright: a phone stores a portrait shot sideways plus a flag
 * saying so, and both paths below apply that flag before drawing.
 */
async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close()
      }
    } catch {
      /* falls through to the element, which some browsers decode more of */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url)
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function encode(image: Drawable, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas 2D unavailable'))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      'image/jpeg',
      quality
    )
  )
}

export interface ProcessedPhoto {
  full: Blob
  thumb: Blob
  width: number
  height: number
  takenAt: number
}

/**
 * A picked file, made ready to keep: resized, re-encoded as JPEG — which
 * leaves its EXIF block, GPS position included, behind — and dated.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  // The date sits in the first kilobytes; reading the whole file would cost
  // a full copy of a 10 MB picture for one tag.
  let takenAt: number | undefined
  try {
    takenAt = readExifDate(await file.slice(0, 128 * 1024).arrayBuffer())
  } catch {
    takenAt = undefined
  }

  const decoded = await decode(file)
  try {
    const size = fitWithin(decoded.width, decoded.height, PHOTO_MAX_EDGE)
    let full: Blob | null = null
    for (const quality of FULL_QUALITIES) {
      full = await encode(decoded.image, size.width, size.height, quality)
      if (full.size <= FULL_TARGET_BYTES) break
    }
    const thumbSize = fitWithin(decoded.width, decoded.height, THUMB_MAX_EDGE)
    const thumb = await encode(decoded.image, thumbSize.width, thumbSize.height, THUMB_QUALITY)
    return {
      full: full!,
      thumb,
      width: size.width,
      height: size.height,
      takenAt: takenAt ?? (file.lastModified || Date.now())
    }
  } finally {
    decoded.release()
  }
}
