/**
 * Reads the files a storage provider publishes for friends — anonymously.
 *
 * A friend's profile can live on a provider the reader never connected:
 * someone without Google Drive still follows a friend who publishes there. So
 * the core asks every bundled storage plugin, enabled or not, and the reader
 * must work with no account at all.
 *
 * It only fetches. Sealed files come back still sealed: the core opens them
 * with the key the friend shared, which a reader never sees.
 */
export interface PublicReader {
  /** The published JSON at this URL, as stored. Throws when it cannot be read. */
  fetchJson(url: string): Promise<unknown>
}
