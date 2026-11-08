/**
 * Reads a friend's public Google Drive files — anonymously.
 *
 * Loaded by the core for anyone following a friend who publishes on Drive,
 * including people who never connected a Drive of their own. So this file
 * stands alone: no sign-in, no token, no PluginContext, nothing from the
 * account side of the plugin (tests/unit/contracts.spec.ts holds it to that).
 * It fetches; the core opens sealed files with the key, which never comes here.
 *
 * gapi.client with an API key is what gets past Drive's CORS on `alt=media`.
 */
import { logger } from '@/utils/logger'
import type { PublicReader } from '@/types/publicReader'

interface GapiClient {
  load(api: string, callbacks: { callback: () => void; onerror: () => void }): void
  client: {
    init(config: { apiKey: string; discoveryDocs: string[] }): Promise<void>
    drive: {
      files: {
        get(params: { fileId: string; alt: string }): Promise<{ body: string }>
      }
    }
  }
}

declare global {
  interface Window {
    gapi: GapiClient
  }
}

class GoogleDrivePublicReader implements PublicReader {
  private initialized = false
  private initPromise: Promise<void> | null = null
  private apiKey: string

  constructor() {
    this.apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY || ''
  }

  /**
   * Initialize gapi.client with API key for anonymous access
   */
  private async initialize(): Promise<void> {
    // Return existing initialization promise if already in progress
    if (this.initPromise) {
      return this.initPromise
    }

    // Already initialized
    if (this.initialized) {
      return Promise.resolve()
    }

    // Check if API key is configured
    if (!this.apiKey) {
      throw new Error(
        'Google Drive API key not configured. Please set VITE_GOOGLE_DRIVE_API_KEY in .env'
      )
    }

    this.initPromise = this.doInitialize()
    await this.initPromise
    this.initPromise = null
  }

  private async doInitialize(): Promise<void> {
    logger.debug('[GDrive public reader] Initializing gapi.client...')

    // Load gapi script if not already loaded
    if (!window.gapi) {
      await this.loadGapiScript()
    }

    // Load gapi.client
    await new Promise<void>((resolve, reject) => {
      window.gapi.load('client', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Failed to load gapi.client'))
      })
    })

    // Initialize gapi.client with API key (no OAuth)
    await window.gapi.client.init({
      apiKey: this.apiKey,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    })

    this.initialized = true
    logger.debug('[GDrive public reader] gapi.client initialized successfully')
  }

  /**
   * Load gapi script dynamically
   */
  private loadGapiScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      if (document.querySelector('script[src*="apis.google.com/js/api.js"]')) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://apis.google.com/js/api.js'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load gapi script'))
      document.head.appendChild(script)
    })
  }

  /**
   * Extract Google Drive file ID from various URL formats
   *
   * Supported formats:
   * - https://drive.google.com/file/d/FILE_ID/view
   * - https://drive.google.com/open?id=FILE_ID
   * - https://drive.google.com/uc?id=FILE_ID&export=download
   * - https://docs.google.com/document/d/FILE_ID/edit
   */
  public extractFileId(url: string): string | null {
    try {
      const urlObj = new URL(url)

      // Format: /file/d/FILE_ID/view or /document/d/FILE_ID/edit
      const pathMatch = urlObj.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)
      if (pathMatch) {
        return pathMatch[1]
      }

      // Format: ?id=FILE_ID
      const idParam = urlObj.searchParams.get('id')
      if (idParam) {
        return idParam
      }

      return null
    } catch (error) {
      console.error('[GDrive public reader] Invalid URL:', error)
      return null
    }
  }

  /**
   * Retry a request on transient 5xx errors with exponential backoff.
   * Retries up to maxRetries times (delays: 1s, 2s).
   * Does not retry on 4xx or other client errors.
   */
  private async fetchWithRetry<T>(request: () => Promise<T>, maxRetries = 2): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request()
      } catch (error: unknown) {
        const status = (error as Record<string, unknown>)?.status
        const isServerError = typeof status === 'number' && status >= 500 && status < 600
        if (!isServerError || attempt >= maxRetries) {
          throw error
        }
        const delay = 1000 * Math.pow(2, attempt) // 1s, 2s
        console.warn(
          `[GDrive public reader] Request failed with ${status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * Fetch file content from Google Drive using gapi.client
   *
   * This method bypasses CORS by using Google's official SDK with API key.
   * The file must be shared publicly ("Anyone with the link").
   *
   * @param fileId Google Drive file ID
   * @returns File content as string
   */
  public async fetchFileContent(fileId: string): Promise<string> {
    // Ensure gapi is initialized
    await this.initialize()

    logger.debug(`[GDrive public reader] Fetching file: ${fileId}`)

    try {
      // Use gapi.client to fetch file with alt=media, with retry on 5xx
      const response = await this.fetchWithRetry(() =>
        window.gapi.client.drive.files.get({
          fileId: fileId,
          alt: 'media'
        })
      )

      if (!response || !response.body) {
        throw new Error('Empty response from Google Drive API')
      }

      logger.debug('[GDrive public reader] File fetched successfully')
      return response.body
    } catch (error: unknown) {
      console.error('[GDrive public reader] Failed to fetch file:', error)

      const err = error as Record<string, unknown>
      // Provide helpful error messages
      if (err.status === 404) {
        throw new Error('File not found. Make sure the file is shared publicly.')
      } else if (err.status === 403) {
        throw new Error('Access denied. Make sure the file is shared "Anyone with the link".')
      } else if (
        (err.result as Record<string, unknown> | undefined)?.error &&
        typeof ((err.result as Record<string, unknown>).error as Record<string, unknown>)
          ?.message === 'string'
      ) {
        const result = err.result as Record<string, unknown>
        const apiError = result.error as Record<string, unknown>
        throw new Error(`Google Drive API error: ${apiError.message}`)
      } else {
        const message = typeof err.message === 'string' ? err.message : 'Unknown error'
        throw new Error(`Failed to fetch file from Google Drive: ${message}`)
      }
    }
  }

  /** The JSON at a public Drive link (`?id=…`, `/d/…`), as stored. */
  public async fetchJson(url: string): Promise<unknown> {
    const fileId = this.extractFileId(url)
    if (!fileId) throw new Error('Could not extract file ID from Google Drive URL')

    const content = await this.fetchFileContent(fileId)
    try {
      return JSON.parse(content)
    } catch {
      throw new Error('Invalid JSON file')
    }
  }
}

export function createPublicReader(): PublicReader {
  return new GoogleDrivePublicReader()
}
