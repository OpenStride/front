import { describe, it, expect } from 'vitest'
import { parseExifDate, readExifDate } from '@/utils/exifDate'
import { fitWithin } from '@/utils/photoImage'

/**
 * A minimal JPEG: SOI, an APP1 "Exif" segment holding a TIFF header, IFD0
 * and — when `inExifIfd` — an Exif IFD carrying DateTimeOriginal; otherwise
 * IFD0 carries DateTime itself.
 */
function jpegWithDate(date: string, little: boolean, inExifIfd = true): ArrayBuffer {
  const tiff: number[] = []
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff])
  const u32 = (v: number) =>
    little
      ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24]
      : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]
  const ascii = [...date].map(c => c.charCodeAt(0)).concat(0)

  // Header: byte order, 42, offset of IFD0 (8)
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8))
  if (inExifIfd) {
    // IFD0 at 8: one entry, the Exif IFD pointer → 26
    tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0))
    // Exif IFD at 26: DateTimeOriginal, ASCII, 20 bytes at 44
    tiff.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0))
  } else {
    // IFD0 at 8: DateTime, ASCII, 20 bytes at 26
    tiff.push(...u16(1), ...u16(0x0132), ...u16(2), ...u32(20), ...u32(26), ...u32(0))
  }
  tiff.push(...ascii)

  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const length = exif.length + 2
  const bytes = [0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, 0xff, 0xd9]
  return new Uint8Array(bytes).buffer
}

describe('readExifDate', () => {
  const expected = new Date(2026, 10, 8, 9, 42, 17).getTime()

  it('reads DateTimeOriginal, Intel byte order', () => {
    expect(readExifDate(jpegWithDate('2026:11:08 09:42:17', true))).toBe(expected)
  })

  it('reads DateTimeOriginal, Motorola byte order', () => {
    expect(readExifDate(jpegWithDate('2026:11:08 09:42:17', false))).toBe(expected)
  })

  it('falls back to the DateTime of IFD0', () => {
    expect(readExifDate(jpegWithDate('2026:11:08 09:42:17', true, false))).toBe(expected)
  })

  it('has nothing to say about a file that is not a JPEG', () => {
    expect(readExifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeUndefined()
    expect(readExifDate(new ArrayBuffer(0))).toBeUndefined()
  })

  it('has nothing to say about a JPEG without EXIF', () => {
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]).buffer
    expect(readExifDate(bare)).toBeUndefined()
  })

  it('survives a truncated segment', () => {
    const full = new Uint8Array(jpegWithDate('2026:11:08 09:42:17', true))
    expect(readExifDate(full.slice(0, 30).buffer)).toBeUndefined()
  })
})

describe('parseExifDate', () => {
  it('reads the wall-clock time in the local zone', () => {
    expect(parseExifDate('2025:01:02 03:04:05')).toBe(new Date(2025, 0, 2, 3, 4, 5).getTime())
  })

  it('ignores a blank date, as cameras write when unset', () => {
    expect(parseExifDate('0000:00:00 00:00:00')).toBeUndefined()
    expect(parseExifDate('    :  :     :  :  ')).toBeUndefined()
  })
})

describe('fitWithin', () => {
  it('scales the longest edge down to the limit, keeping the ratio', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(3024, 4032, 2048)).toEqual({ width: 1536, height: 2048 })
  })

  it('never enlarges a small picture', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 })
  })
})
