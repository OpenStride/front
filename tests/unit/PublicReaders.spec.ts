import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPublicJson, isPublicUrl } from '@/services/PublicReaders'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import type { StoragePlugin } from '@/types/storage'

/**
 * A friend's profile is read through the storage plugin it lives on — whether
 * or not the reader connected that provider. The core keeps no provider name.
 */
function plugin(id: string, hosts: string[], fetchJson?: (url: string) => unknown) {
  const load = vi.fn(async () => ({ fetchJson: vi.fn(async (url: string) => fetchJson!(url)) }))
  return {
    p: {
      id,
      publicHosts: hosts,
      ...(fetchJson ? { publicReader: load } : {})
    } as unknown as StoragePlugin,
    load
  }
}

describe('reading what friends publish', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads a link through the plugin of its host, loading that reader only', async () => {
    const drive = plugin('drive', ['drive.example'], url => ({ from: 'drive', url }))
    const box = plugin('box', ['box.example'], () => ({ from: 'box' }))

    const json = await fetchPublicJson('https://drive.example/uc?id=1', [drive.p, box.p])

    expect(json).toEqual({ from: 'drive', url: 'https://drive.example/uc?id=1' })
    expect(drive.load).toHaveBeenCalledTimes(1)
    expect(box.load).not.toHaveBeenCalled()
  })

  it('loads a reader once, however many links it reads', async () => {
    const drive = plugin('drive-once', ['drive.example'], () => ({}))
    await fetchPublicJson('https://drive.example/a', [drive.p])
    await fetchPublicJson('https://drive.example/b', [drive.p])
    expect(drive.load).toHaveBeenCalledTimes(1)
  })

  it('falls back to a plain fetch when no reader claims the host', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ plain: true })))
    vi.stubGlobal('fetch', fetchMock)

    const json = await fetchPublicJson('https://cdn.example/manifest.json', [])

    expect(json).toEqual({ plain: true })
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/manifest.json', expect.anything())
  })

  it('throws on a link that does not answer, for the caller to report', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    )
    await expect(fetchPublicJson('https://cdn.example/gone.json', [])).rejects.toThrow('404')
  })

  it('accepts a share link only on a host a storage plugin publishes to', () => {
    const drive = plugin('drive', ['drive.example'])
    expect(isPublicUrl('https://drive.example/uc?id=1', [drive.p])).toBe(true)
    expect(isPublicUrl('https://evil.example/manifest.json', [drive.p])).toBe(false)
    expect(isPublicUrl('not a url', [drive.p])).toBe(false)
  })

  it('offers Google Drive links from the bundled plugin, whether enabled or not', () => {
    const gdrive = allStoragePlugins.find(p => p.id === 'gdrive')!
    expect(gdrive.publicHosts).toContain('drive.google.com')
    expect(gdrive.publicReader).toBeTypeOf('function')
    expect(isPublicUrl('https://drive.google.com/uc?id=ABC')).toBe(true)
  })
})
