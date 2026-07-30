import type { Component } from 'vue'
import type { PluginContext } from './plugin-context'

export interface StoragePlugin {
  id: string
  label: string
  icon?: string
  description?: string
  /**
   * The plugin's configuration screen, loaded on demand.
   *
   * Typed as a `Component` rather than `unknown`: every caller assigned the
   * result straight into a `shallowRef<Component>` and had to be trusted to be
   * right, which `tsc` never checked because those callers are all `.vue`.
   */
  setupComponent: () => Promise<Component>
  //syncData: (onlystores?: string[] | null) => Promise<unknown>
  readRemote(store: string): Promise<unknown[]>
  writeRemote(store: string, data: unknown[]): Promise<void>
  /**
   * Optional: return an opaque token that changes iff the remote content of
   * `store` changed, obtained cheaply WITHOUT downloading the full content
   * (e.g. a file checksum / modifiedTime). Lets SyncService skip the full
   * remote read when the token is unchanged and there is nothing local to push.
   * Return null if unavailable (SyncService then falls back to a full read).
   */
  getRemoteChangeToken?(store: string): Promise<string | null>

  // ========== PUBLIC FILE SHARING CAPABILITIES ==========
  /**
   * Optional: indicates if this plugin supports public file sharing
   * (files accessible via public URL without authentication)
   */
  supportsPublicFiles?: boolean

  /**
   * Optional: write a file to public storage (anyone with link can read)
   * Returns the public URL for accessing the file, or null if failed
   */
  writePublicFile?(filename: string, content: unknown): Promise<string | null>

  /**
   * Optional: delete a file from storage by its ID
   * Used for cleanup and rollback operations
   */
  deleteFile?(fileId: string): Promise<boolean>

  /**
   * Optional: get the public URL for an existing file
   */
  getPublicFileUrl?(filename: string): Promise<string | null>

  /**
   * Optional: extract file ID from a public URL
   * Provider-specific URL parsing
   */
  extractFileIdFromUrl?(url: string): string | null
  context?: PluginContext
}
