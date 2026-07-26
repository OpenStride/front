// plugins/storage-providers/Dropbox/client/DropboxFileService.ts
import { DropboxAuthService } from './DropboxAuthService'

// RPC calls (metadata, delete, sharing) vs content calls (upload, download):
// Dropbox splits them across two hosts, both CORS-enabled.
const RPC_ENDPOINT = 'https://api.dropboxapi.com/2'
const CONTENT_ENDPOINT = 'https://content.dropboxapi.com/2'

// Sub-folder holding files published for friends. Backups live at the root of
// the app folder, mirroring the OpenStride/ + OpenStride/public/ layout on Drive.
const PUBLIC_FOLDER = '/public'

type RpcResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; summary: string }

/**
 * JSON for the `Dropbox-API-Arg` header.
 *
 * HTTP headers are ASCII-only, so any character above U+007F has to be escaped;
 * Dropbox decodes the `\uXXXX` sequences back into the original JSON.
 */
function apiArg(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007F-\uFFFF]/g,
    c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  )
}

/** Dropbox reports business errors as `namespace/reason/...` in `error_summary`. */
function errorSummary(text: string): string {
  try {
    const parsed = JSON.parse(text)
    return typeof parsed?.error_summary === 'string' ? parsed.error_summary : text
  } catch {
    return text
  }
}

/** A missing file is a normal state (nothing backed up yet), not a failure. */
function isNotFound(summary: string): boolean {
  return summary.includes('not_found')
}

export class DropboxFileService {
  // The promise, not the instance, is the singleton: SyncService resolves the
  // service once per store, so callers can overlap. Memoizing after the await
  // would hand a half-built service to whoever arrived second.
  private static instancePromise: Promise<DropboxFileService> | null = null
  private authService: DropboxAuthService | null = null

  private constructor() {
    /* singleton */
  }

  public static async getInstance(): Promise<DropboxFileService> {
    if (!DropboxFileService.instancePromise) {
      DropboxFileService.instancePromise = (async () => {
        const service = new DropboxFileService()
        service.authService = await DropboxAuthService.getInstance()
        return service
      })()
    }
    return DropboxFileService.instancePromise
  }

  private async token(): Promise<string | null> {
    const token = await this.authService?.getAccessToken()
    if (!token) console.error('[Dropbox] Not authenticated with Dropbox.')
    return token ?? null
  }

  private async rpc(path: string, body: unknown): Promise<RpcResult> {
    const token = await this.token()
    if (!token) return { ok: false, status: 401, summary: 'not_authenticated' }

    const response = await fetch(`${RPC_ENDPOINT}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (response.ok) {
      return { ok: true, data: await response.json() }
    }
    return { ok: false, status: response.status, summary: errorSummary(await response.text()) }
  }

  // ========== BACKUP FILES ==========

  /** Absolute path of a backup file inside the app folder. */
  private backupPath(filename: string): string {
    return `/${filename}`
  }

  /**
   * Read and parse a JSON file. Returns null when the file does not exist yet
   * or cannot be read — callers treat that as "nothing backed up".
   */
  public async readFileContent(path: string): Promise<unknown> {
    const token = await this.token()
    if (!token) return null

    // No Content-Type here: the download endpoint rejects requests that carry
    // one, because the arguments travel in the Dropbox-API-Arg header instead.
    const response = await fetch(`${CONTENT_ENDPOINT}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': apiArg({ path })
      }
    })

    if (!response.ok) {
      const summary = errorSummary(await response.text())
      if (isNotFound(summary)) {
        console.log(`[Dropbox] No file at "${path}" yet`)
      } else {
        console.warn(`[Dropbox] Failed to download "${path}":`, summary)
      }
      return null
    }

    const text = await response.text()
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch (error) {
      console.warn(`[Dropbox] File "${path}" is not valid JSON`, error)
      return null
    }
  }

  /** Read a backup file by name (e.g. `activities_backup.json`). */
  public async readBackupFile(filename: string): Promise<unknown> {
    return this.readFileContent(this.backupPath(filename))
  }

  /**
   * Overwrite a JSON file, creating it and any missing parent folder.
   * `mute` keeps the user's Dropbox clients from notifying on every sync.
   */
  public async writeFile(path: string, content: unknown): Promise<boolean> {
    const token = await this.token()
    if (!token) return false

    const response = await fetch(`${CONTENT_ENDPOINT}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': apiArg({ path, mode: 'overwrite', autorename: false, mute: true })
      },
      body: JSON.stringify(content)
    })

    if (!response.ok) {
      console.error(`[Dropbox] Failed to upload "${path}":`, errorSummary(await response.text()))
      return false
    }
    return true
  }

  /** Write a backup file by name. Throws so SyncService can surface the failure. */
  public async writeBackupFile(filename: string, content: unknown): Promise<void> {
    const ok = await this.writeFile(this.backupPath(filename), content)
    if (!ok) throw new Error(`Cannot write ${filename} to Dropbox`)
  }

  /**
   * Cheap change-detection: file metadata only, no content download.
   * `content_hash` changes iff the bytes changed; `rev` is the fallback.
   */
  public async getBackupFileMeta(
    filename: string
  ): Promise<{ contentHash?: string; rev?: string; serverModified?: string } | null> {
    const result = await this.rpc('/files/get_metadata', { path: this.backupPath(filename) })

    if (!result.ok) {
      if (!isNotFound(result.summary) && result.summary !== 'not_authenticated') {
        console.warn(`[Dropbox] Failed to read metadata for "${filename}":`, result.summary)
      }
      return null
    }

    return {
      contentHash: result.data.content_hash as string | undefined,
      rev: result.data.rev as string | undefined,
      serverModified: result.data.server_modified as string | undefined
    }
  }

  // ========== PUBLIC FILE SHARING ==========

  private publicPath(filename: string): string {
    return `${PUBLIC_FOLDER}/${filename}`
  }

  /**
   * Turn a Dropbox share link into a URL that serves the raw bytes.
   *
   * `www.dropbox.com/scl/...` answers with an HTML preview page, while the
   * `dl.dropboxusercontent.com` host returns the file itself and allows
   * cross-origin reads — which is what a friend's browser needs to fetch the
   * manifest directly, with no API key and no proxy.
   */
  public static toDirectDownloadUrl(shareUrl: string): string {
    try {
      const url = new URL(shareUrl)
      url.hostname = 'dl.dropboxusercontent.com'
      // Preview/force-download switches are meaningless on the content host.
      url.searchParams.delete('dl')
      url.searchParams.delete('raw')
      return url.toString()
    } catch {
      return shareUrl
    }
  }

  /**
   * Existing public link for a path, or null when none was created yet.
   */
  private async findSharedLink(path: string): Promise<string | null> {
    const result = await this.rpc('/sharing/list_shared_links', { path, direct_only: true })
    if (!result.ok) {
      if (!isNotFound(result.summary)) {
        console.warn(`[Dropbox] Failed to list shared links for "${path}":`, result.summary)
      }
      return null
    }

    const links = result.data.links as Array<{ url?: string }> | undefined
    return links?.[0]?.url ?? null
  }

  /**
   * Public link for a path, created on first use and reused afterwards.
   */
  private async ensureSharedLink(path: string): Promise<string | null> {
    const created = await this.rpc('/sharing/create_shared_link_with_settings', {
      path,
      settings: { requested_visibility: 'public' }
    })

    if (created.ok) {
      return (created.data.url as string) ?? null
    }

    // Already shared: the existing link is the one to use.
    if (created.summary.includes('shared_link_already_exists')) {
      return this.findSharedLink(path)
    }

    // Some team/business accounts forbid pinning the visibility explicitly.
    // Retry letting Dropbox apply the account default before giving up.
    if (created.summary.includes('settings_error')) {
      const retry = await this.rpc('/sharing/create_shared_link_with_settings', { path })
      if (retry.ok) return (retry.data.url as string) ?? null
      if (retry.summary.includes('shared_link_already_exists')) return this.findSharedLink(path)
      console.error(`[Dropbox] Failed to share "${path}":`, retry.summary)
      return null
    }

    console.error(`[Dropbox] Failed to share "${path}":`, created.summary)
    return null
  }

  /**
   * Upload a file to the public folder and return its direct download URL.
   */
  public async writePublicFile(filename: string, content: unknown): Promise<string | null> {
    const path = this.publicPath(filename)

    if (!(await this.writeFile(path, content))) return null

    const shareUrl = await this.ensureSharedLink(path)
    if (!shareUrl) {
      console.warn(`[Dropbox] "${filename}" uploaded but could not be made public`)
      return null
    }

    return DropboxFileService.toDirectDownloadUrl(shareUrl)
  }

  /**
   * Direct download URL of an already-published file, or null when the file
   * does not exist.
   */
  public async getPublicFileUrl(filename: string): Promise<string | null> {
    const path = this.publicPath(filename)

    const existing = await this.findSharedLink(path)
    if (existing) return DropboxFileService.toDirectDownloadUrl(existing)

    // No link yet — only create one if the file is actually there.
    const meta = await this.rpc('/files/get_metadata', { path })
    if (!meta.ok) return null

    const shareUrl = await this.ensureSharedLink(path)
    return shareUrl ? DropboxFileService.toDirectDownloadUrl(shareUrl) : null
  }

  /**
   * Delete a file. Dropbox has no opaque file ids in this flow, so the plugin
   * uses the file path as its identifier (see `extractFileIdFromUrl`).
   */
  public async deleteFile(path: string): Promise<boolean> {
    const result = await this.rpc('/files/delete_v2', { path })

    if (!result.ok) {
      // Already gone is a success from the caller's point of view (rollback).
      if (isNotFound(result.summary)) return true
      console.error(`[Dropbox] Failed to delete "${path}":`, result.summary)
      return false
    }
    return true
  }

  /**
   * Recover the Dropbox path from a public URL.
   *
   * Share URLs (`.../scl/fi/<opaque>/manifest.json?rlkey=...`) keep the original
   * filename as their last segment, and every published file lives in the same
   * public folder — enough to rebuild the path used for deletion.
   */
  public static extractPathFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url)
      if (!/(^|\.)dropbox(usercontent)?\.com$/.test(parsed.hostname)) return null

      const filename = parsed.pathname.split('/').filter(Boolean).pop()
      if (!filename) return null

      return `${PUBLIC_FOLDER}/${decodeURIComponent(filename)}`
    } catch {
      return null
    }
  }
}
