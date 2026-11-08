import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'
import {
  OWNER_SHARE_KEY,
  generateShareKey,
  isSealed,
  openJson,
  sealJson
} from '@/utils/publicCrypto'
import { ShareUrlService } from '@/services/ShareUrlService'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

const { PublicKeyRing } = await import('@/services/PublicKeyRing')
const { FriendSyncService } = await import('@/services/FriendSyncService')
const { PublicFileService } = await import('@/services/PublicFileService')
const { PublicDataPublisher } = await import('@/services/PublicDataPublisher')

let db: FakeDB
beforeEach(async () => {
  FakeDB.resetInstance()
  db = (await FakeDB.getInstance()) as FakeDB
  db.reset()
  PublicKeyRing.reset()
  vi.restoreAllMocks()
})

describe('sealing a public file', () => {
  it('opens with its key, and only with it', async () => {
    const key = generateShareKey()
    const sealed = await sealJson({ username: 'Côme', km: 42 }, key)
    expect(isSealed(sealed)).toBe(true)
    expect(JSON.stringify(sealed)).not.toContain('Côme')
    expect(await openJson(sealed, key)).toEqual({ username: 'Côme', km: 42 })
    await expect(openJson(sealed, generateShareKey())).rejects.toThrow()
    await expect(openJson(sealed, undefined)).rejects.toThrow()
  })

  it('reads a profile published before encryption as it is', async () => {
    expect(await openJson({ username: 'old' }, undefined)).toEqual({ username: 'old' })
  })

  it('draws a different key every time', () => {
    expect(generateShareKey()).not.toBe(generateShareKey())
    expect(generateShareKey()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('the share link', () => {
  it('carries the key in its fragment, never in what a server receives', () => {
    const link = ShareUrlService.wrapManifestUrl('https://drive.google.com/uc?id=ABC', 'KEY123')
    const url = new URL(link)
    expect(url.search).not.toContain('KEY123')
    expect(url.hash).toBe('#k=KEY123')
    expect(ShareUrlService.keyOf(link)).toBe('KEY123')
    expect(ShareUrlService.unwrapManifestUrl(link)).toBe('https://drive.google.com/uc?id=ABC')
    expect(ShareUrlService.keyOf(ShareUrlService.wrapManifestUrl('https://x/m'))).toBeUndefined()
  })
})

describe('reading a sealed friend', () => {
  it('opens the manifest with the friend’s key, then every file it lists', async () => {
    const key = generateShareKey()
    await db.addItemsToStore(
      'friends',
      [{ id: 'f1', publicUrl: 'https://host.test/manifest', shareKey: key }],
      (f: { id: string }) => f.id
    )
    const files: Record<string, unknown> = {
      'https://host.test/manifest': await sealJson(
        { availableYears: [{ year: 2026, fileUrl: 'https://host.test/2026' }] },
        key
      ),
      'https://host.test/2026': await sealJson({ year: 2026, activities: [{ id: 'r' }] }, key)
    }
    vi.stubGlobal('fetch', async (url: string) => ({ ok: true, json: async () => files[url] }))

    const sync = FriendSyncService.getInstance()
    const manifest = await sync.fetchManifest('https://host.test/manifest')
    expect(manifest?.availableYears[0].year).toBe(2026)
    const year = await sync.fetchJson<{ activities: unknown[] }>('https://host.test/2026', 'x')
    expect(year?.activities).toEqual([{ id: 'r' }])
    vi.unstubAllGlobals()
  })

  it('treats a sealed profile without its key as unreachable', async () => {
    const sealed = await sealJson({ availableYears: [] }, generateShareKey())
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => sealed }))
    expect(await FriendSyncService.getInstance().fetchManifest('https://host.test/m')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('publishing sealed', () => {
  it('seals every public file once the reader has a key', async () => {
    const written: unknown[] = []
    const files = PublicFileService.getInstance()
    vi.spyOn(
      files as unknown as { getPublicFilePlugin(): Promise<unknown> },
      'getPublicFilePlugin'
    ).mockResolvedValue({
      writePublicFile: async (_name: string, content: unknown) => {
        written.push(content)
        return 'https://host.test/f'
      }
    })
    await files.writePublicFile('a.json', { plain: true })
    const key = generateShareKey()
    await db.saveData(OWNER_SHARE_KEY, key)
    await files.writePublicFile('b.json', { plain: true })

    expect(written[0]).toEqual({ plain: true })
    expect(isSealed(written[1])).toBe(true)
    expect(await openJson(written[1], key)).toEqual({ plain: true })
  })

  it('changes the link: old files gone, a new key, a new address', async () => {
    const publisher = PublicDataPublisher.getInstance()
    const old = generateShareKey()
    await db.saveData(OWNER_SHARE_KEY, old)
    await db.saveData('myPublicUrl', 'https://drive.google.com/uc?id=OLD')
    const clear = vi
      .spyOn(PublicFileService.getInstance(), 'clearPublicFiles')
      .mockResolvedValue(true)
    const publish = vi.spyOn(publisher, 'publishPublicData').mockImplementation(async () => {
      await db.saveData('myPublicUrl', 'https://drive.google.com/uc?id=NEW')
      return 'new'
    })

    await publisher.rotatePublicLink()

    expect(clear).toHaveBeenCalledBefore(publish)
    const key = await db.getData(OWNER_SHARE_KEY)
    expect(key).not.toBe(old)
    const link = (await publisher.getMyPublicUrl())!
    expect(ShareUrlService.unwrapManifestUrl(link)).toBe('https://drive.google.com/uc?id=NEW')
    expect(ShareUrlService.keyOf(link)).toBe(key)
  })

  it('keeps the old link and key when the old files cannot be removed', async () => {
    const publisher = PublicDataPublisher.getInstance()
    const old = generateShareKey()
    await db.saveData(OWNER_SHARE_KEY, old)
    vi.spyOn(PublicFileService.getInstance(), 'clearPublicFiles').mockResolvedValue(false)
    const publish = vi.spyOn(publisher, 'publishPublicData')

    expect(await publisher.rotatePublicLink()).toBeNull()
    expect(await db.getData(OWNER_SHARE_KEY)).toBe(old)
    expect(publish).not.toHaveBeenCalled()
  })
})
