import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../plugins/storage-providers/GDrive/client/GoogleDriveAuthService', () => ({
  GoogleDriveAuthService: {
    getInstance: async () => ({ getAccessToken: async () => 'token' })
  }
}))

const { GoogleDriveFileService } =
  await import('../../plugins/storage-providers/GDrive/client/GoogleDriveFileService')

type Call = { url: string; init?: Parameters<typeof fetch>[1] }

/** Drive as far as these calls go: the OpenStride and photos folders exist. */
function stubDrive(handlers: { upload?: () => Response; download?: () => Response } = {}) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url, init })
      if (url.includes('uploadType=multipart')) {
        return handlers.upload?.() ?? new Response(JSON.stringify({ id: 'file-1' }))
      }
      if (url.includes('alt=media')) {
        return handlers.download?.() ?? new Response(new Blob(['jpeg-bytes']))
      }
      if (url.includes('?q=')) {
        const id = decodeURIComponent(url).includes("name='photos'") ? 'photos-folder' : 'root'
        return new Response(JSON.stringify({ files: [{ id }] }))
      }
      if (init?.method === 'DELETE') return new Response(null, { status: 404 })
      return new Response('{}')
    })
  )
  return calls
}

describe('Google Drive photo files', () => {
  beforeEach(() => {
    ;(GoogleDriveFileService as unknown as { instance?: unknown }).instance = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads a photo privately into OpenStride/photos, in one multipart request', async () => {
    const calls = stubDrive()
    const fs = await GoogleDriveFileService.getInstance()

    const id = await fs.writeFile('p1.jpg', new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))

    expect(id).toBe('file-1')
    const upload = calls.find(c => c.url.includes('uploadType=multipart'))!
    const contentType = (upload.init!.headers as Record<string, string>)['Content-Type']
    const boundary = /boundary=(.+)$/.exec(contentType)![1]
    const body = await (upload.init!.body as Blob).text()
    expect(body.startsWith(`--${boundary}\r\n`)).toBe(true)
    expect(body.endsWith(`\r\n--${boundary}--`)).toBe(true)
    expect(body).toContain('{"name":"p1.jpg","parents":["photos-folder"]}')
    expect(body).toContain('Content-Type: image/jpeg\r\n\r\njpeg-bytes')
    // Never made public
    expect(calls.some(c => c.url.includes('/permissions'))).toBe(false)
  })

  it('reports a failed upload as null', async () => {
    stubDrive({ upload: () => new Response('quota', { status: 403 }) })
    const fs = await GoogleDriveFileService.getInstance()
    expect(await fs.writeFile('p1.jpg', new Blob(['x']))).toBeNull()
  })

  it('downloads a photo back, null once it is gone', async () => {
    stubDrive()
    const fs = await GoogleDriveFileService.getInstance()
    expect(await (await fs.readFile('file-1'))!.text()).toBe('jpeg-bytes')

    stubDrive({ download: () => new Response('', { status: 404 }) })
    expect(await fs.readFile('file-1')).toBeNull()
  })

  it('counts a file already gone as deleted', async () => {
    stubDrive()
    const fs = await GoogleDriveFileService.getInstance()
    expect(await fs.deleteFile('file-1')).toBe(true)
  })
})
