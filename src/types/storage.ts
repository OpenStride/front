import type { Component } from 'vue'
import type { PluginRoute } from './pluginRoute'
import type { PublicReader } from './publicReader'
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
  /**
   * Whether the user's account is connected. The onboarding asks this after
   * the provider's sign-in, instead of reading a token it should not know the
   * name of. Omitted means the plugin cannot tell, and counts as not connected.
   */
  isConnected?: () => Promise<boolean>
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

  // ========== READING FRIENDS' PUBLIC FILES ==========
  /**
   * Optional: the hosts this provider's public links live on, e.g.
   * `['drive.google.com']`. A share link is accepted only if its manifest is on
   * one of them, and a URL on them is read through `publicReader`.
   */
  publicHosts?: string[]

  /**
   * Optional: how to read a public link on `publicHosts` without an account,
   * when a plain `fetch` cannot (CORS, an API key). Loaded only when such a
   * link is read, from any bundled plugin whether enabled or not. Omitted, the
   * core reads those links with a plain `fetch`. See `PublicReader`, and the
   * isolation rules in docs/PLUGIN_GUIDELINES.md.
   */
  publicReader?: () => Promise<PublicReader>

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

  // ========== PRIVATE FILES ==========
  /**
   * Optional: store a binary file (a photo) in the user's private space.
   * Returns the provider's id for it, or null when the upload failed.
   */
  writeFile?(name: string, content: Blob): Promise<string | null>

  /**
   * Optional: read back a file written by `writeFile`. Null when it is gone.
   */
  readFile?(fileId: string): Promise<Blob | null>

  /**
   * Optional: delete a file from storage by its ID. A file already gone
   * counts as deleted.
   * Used for cleanup and rollback operations
   */
  deleteFile?(fileId: string): Promise<boolean>

  /**
   * Optional: get the public URL for an existing file
   */
  getPublicFileUrl?(filename: string): Promise<string | null>

  /**
   * Optional: delete every file of the public folder. Changing one's share
   * link needs the old files gone, so the old link opens nothing.
   */
  clearPublicFiles?(): Promise<boolean>

  /**
   * Optional: extract file ID from a public URL
   * Provider-specific URL parsing
   */
  extractFileIdFromUrl?(url: string): string | null
  /**
   * Optional: pages this plugin needs at a fixed address, typically the OAuth
   * callback its provider redirects to. Unlike an extension's routes they are
   * reachable whether the plugin is enabled or not: the callback arrives while
   * the plugin is being connected.
   */
  routes?: PluginRoute[]
  context?: PluginContext
}
