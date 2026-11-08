/**
 * The moment a JPEG was taken, read from its EXIF block — and nothing else.
 *
 * A full EXIF library would weigh more than the rest of the photo feature; one
 * tag is all we need, to order an outing's photos the way it went. The value
 * is a wall-clock time without a zone ("2026:11:08 09:42:17"), read here in the
 * device's zone, which is where the photo was taken in nearly every case.
 */

const DATE_TIME_ORIGINAL = 0x9003
const DATE_TIME = 0x0132
const EXIF_IFD_POINTER = 0x8769

/** Undefined for anything that is not a JPEG carrying a readable date. */
export function readExifDate(buffer: ArrayBuffer): number | undefined {
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    if ((marker & 0xff00) !== 0xff00) return undefined
    const length = view.getUint16(offset + 2)
    // APP1 holding "Exif\0\0"
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && isExifHeader(view, offset + 4)) {
      return readTiff(view, offset + 10, Math.min(view.byteLength, offset + 2 + length))
    }
    // Start of scan: the metadata is over
    if (marker === 0xffda) return undefined
    offset += 2 + length
  }
  return undefined
}

function isExifHeader(view: DataView, at: number): boolean {
  return view.getUint32(at) === 0x45786966 && view.getUint16(at + 4) === 0
}

function readTiff(view: DataView, start: number, end: number): number | undefined {
  if (start + 8 > end) return undefined
  const order = view.getUint16(start)
  if (order !== 0x4949 && order !== 0x4d4d) return undefined
  const little = order === 0x4949

  const u16 = (at: number) => view.getUint16(at, little)
  const u32 = (at: number) => view.getUint32(at, little)

  const entries = (ifd: number): Map<number, number> => {
    const tags = new Map<number, number>()
    const at = start + ifd
    if (at + 2 > end) return tags
    const count = u16(at)
    for (let i = 0; i < count; i++) {
      const entry = at + 2 + i * 12
      if (entry + 12 > end) break
      tags.set(u16(entry), entry)
    }
    return tags
  }

  const ascii = (entry: number): string | undefined => {
    const count = u32(entry + 4)
    if (count < 19) return undefined
    // More than four bytes: the value lives at an offset from the TIFF header
    const at = start + u32(entry + 8)
    if (at + 19 > end) return undefined
    let text = ''
    for (let i = 0; i < 19; i++) text += String.fromCharCode(view.getUint8(at + i))
    return text
  }

  const ifd0 = entries(u32(start + 4))
  let text: string | undefined
  const pointer = ifd0.get(EXIF_IFD_POINTER)
  if (pointer !== undefined) {
    const exif = entries(u32(pointer + 8))
    const original = exif.get(DATE_TIME_ORIGINAL)
    if (original !== undefined) text = ascii(original)
  }
  if (!text) {
    const modified = ifd0.get(DATE_TIME)
    if (modified !== undefined) text = ascii(modified)
  }
  return text ? parseExifDate(text) : undefined
}

/** "YYYY:MM:DD HH:MM:SS", local time → ms. Undefined for a blank or broken value. */
export function parseExifDate(text: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text)
  if (!m) return undefined
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  if (!y || !mo || !d) return undefined
  const ms = new Date(y, mo - 1, d, h, mi, s).getTime()
  return Number.isFinite(ms) ? ms : undefined
}
