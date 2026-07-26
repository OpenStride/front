import type { PluginContext } from './plugin-context'
import type { PluginPreferenceDeclaration } from './plugin-preferences'

/**
 * Shared preference naming the storage plugin that publishes public files.
 *
 * Every plugin with `supportsPublicFiles` declares a default for this key, so
 * the first one installed claims it and later ones leave it alone. Lives here
 * rather than in a service so plugins can reference it without importing core.
 */
export const PUBLIC_FILE_PROVIDER_PREFERENCE = 'publicFileProvider'

export interface StoragePlugin {
  id: string
  label: string
  icon?: string
  description?: string
  setupComponent: () => Promise<unknown>
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

  /**
   * Preferences this plugin declares. Their defaults are proposed once, when the
   * plugin is installed, and only for keys that hold no value yet.
   */
  preferences?: PluginPreferenceDeclaration[]
  context?: PluginContext
}
