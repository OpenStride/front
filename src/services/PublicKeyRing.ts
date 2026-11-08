import { IndexedDBService } from './IndexedDBService'
import { openJson } from '@/utils/publicCrypto'
import type { Friend, PublicManifest } from '@/types/friend'

/**
 * Which key opens which friend's public files.
 *
 * A friend's key is stored on their record (`Friend.shareKey`), against their
 * manifest URL. Every file their manifest lists is opened with the same key,
 * so the URLs are learnt as the manifest is read. Fetchers stay as they were:
 * they hand what they downloaded to `open`, which finds the key by URL.
 */
const keys = new Map<string, string>()
let friendsLoaded = false

export const PublicKeyRing = {
  remember(url: string, key: string | undefined): void {
    if (url && key) keys.set(url, key)
  },

  async keyFor(url: string): Promise<string | undefined> {
    if (!keys.has(url) && !friendsLoaded) {
      friendsLoaded = true
      const db = await IndexedDBService.getInstance()
      const friends = ((await db.getAllData('friends').catch(() => [])) ?? []) as Friend[]
      for (const f of friends) if (f.shareKey) keys.set(f.publicUrl, f.shareKey)
    }
    return keys.get(url)
  },

  /** The downloaded content of `url`, opened; a manifest teaches the URLs it lists. */
  async open<T>(url: string, payload: unknown): Promise<T> {
    const key = await this.keyFor(url)
    const content = await openJson<T>(payload, key)
    const manifest = content as unknown as Partial<PublicManifest>
    if (key && Array.isArray(manifest?.availableYears)) {
      for (const y of manifest.availableYears) {
        this.remember(y.fileUrl, key)
        if (y.detailsUrl) this.remember(y.detailsUrl, key)
      }
      for (const y of manifest.availableInteractionYears ?? []) this.remember(y.fileUrl, key)
    }
    return content
  },

  /** For tests, and after the friends list changed under us. */
  reset(): void {
    keys.clear()
    friendsLoaded = false
  }
}
