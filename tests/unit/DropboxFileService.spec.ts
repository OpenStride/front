import { describe, it, expect, vi } from 'vitest'

// The auth service resolves the plugin context at construction time; stub it so
// the module can be imported without touching IndexedDB.
vi.mock('@/services/PluginContextFactory', () => ({
  getPluginContext: vi.fn(() =>
    Promise.resolve({
      storage: {
        getData: vi.fn(),
        saveData: vi.fn(),
        deleteData: vi.fn(),
        importFromRemote: vi.fn()
      }
    })
  )
}))

import { DropboxFileService } from '../../plugins/storage-providers/Dropbox/client/DropboxFileService'

describe('DropboxFileService.toDirectDownloadUrl', () => {
  it('rewrites a modern share link onto the raw-content host', () => {
    const url = DropboxFileService.toDirectDownloadUrl(
      'https://www.dropbox.com/scl/fi/abc123/manifest.json?rlkey=k3y&dl=0'
    )

    expect(url).toBe('https://dl.dropboxusercontent.com/scl/fi/abc123/manifest.json?rlkey=k3y')
  })

  it('rewrites a legacy /s/ share link', () => {
    const url = DropboxFileService.toDirectDownloadUrl(
      'https://www.dropbox.com/s/abc123/manifest.json?dl=0'
    )

    expect(url).toBe('https://dl.dropboxusercontent.com/s/abc123/manifest.json')
  })

  it('keeps the rlkey, which the content host requires', () => {
    const url = DropboxFileService.toDirectDownloadUrl(
      'https://www.dropbox.com/scl/fi/x/activities-2025.json?rlkey=secret&st=abcd&dl=0'
    )

    expect(url).toContain('rlkey=secret')
    expect(url).toContain('st=abcd')
    expect(url).not.toContain('dl=')
  })

  it('drops a raw=1 switch, meaningless on the content host', () => {
    const url = DropboxFileService.toDirectDownloadUrl(
      'https://www.dropbox.com/scl/fi/x/manifest.json?raw=1'
    )

    expect(url).toBe('https://dl.dropboxusercontent.com/scl/fi/x/manifest.json')
  })

  it('returns the input unchanged when it is not a URL', () => {
    expect(DropboxFileService.toDirectDownloadUrl('not a url')).toBe('not a url')
  })
})

describe('DropboxFileService.extractPathFromUrl', () => {
  it('rebuilds the public path from a direct download URL', () => {
    const path = DropboxFileService.extractPathFromUrl(
      'https://dl.dropboxusercontent.com/scl/fi/abc123/manifest.json?rlkey=k3y'
    )

    expect(path).toBe('/public/manifest.json')
  })

  it('rebuilds the public path from a www share URL', () => {
    const path = DropboxFileService.extractPathFromUrl(
      'https://www.dropbox.com/scl/fi/abc123/activities-2025.json?rlkey=k3y&dl=0'
    )

    expect(path).toBe('/public/activities-2025.json')
  })

  it('decodes percent-encoded filenames', () => {
    const path = DropboxFileService.extractPathFromUrl(
      'https://dl.dropboxusercontent.com/scl/fi/x/my%20file.json'
    )

    expect(path).toBe('/public/my file.json')
  })

  it('rejects URLs from another provider', () => {
    expect(
      DropboxFileService.extractPathFromUrl('https://drive.google.com/uc?id=ABC&export=download')
    ).toBeNull()
  })

  it('rejects a look-alike host', () => {
    expect(
      DropboxFileService.extractPathFromUrl(
        'https://dropbox.com.evil.example/scl/fi/x/manifest.json'
      )
    ).toBeNull()
  })

  it('returns null when there is no filename segment', () => {
    expect(DropboxFileService.extractPathFromUrl('https://www.dropbox.com/')).toBeNull()
  })

  it('returns null for a malformed URL', () => {
    expect(DropboxFileService.extractPathFromUrl('nope')).toBeNull()
  })
})

describe('round trip', () => {
  it('a published URL maps back to the path it was written to', () => {
    const shareUrl = 'https://www.dropbox.com/scl/fi/zzz/manifest.json?rlkey=k&dl=0'
    const direct = DropboxFileService.toDirectDownloadUrl(shareUrl)

    // What PublicDataPublisher does: store the URL, then extract the id it will
    // hand to deleteFile() during a rollback.
    expect(DropboxFileService.extractPathFromUrl(direct)).toBe('/public/manifest.json')
  })
})
