import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import type { StoragePlugin } from '@/types/storage'
import type { PublicReader } from '@/types/publicReader'

/**
 * Reading what friends publish, whichever provider they publish on.
 *
 * Every bundled storage plugin takes part, enabled or not: following a friend
 * who publishes on Google Drive must not require connecting one's own Drive.
 * The core keeps no provider's name — each plugin states its hosts and, when a
 * plain fetch would not do, brings a reader. A reader loads only when a link of
 * its hosts is read.
 */

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function pluginFor(url: string, plugins: StoragePlugin[]): StoragePlugin | undefined {
  const host = hostOf(url)
  return host ? plugins.find(p => p.publicHosts?.includes(host)) : undefined
}

/** Whether a manifest URL is on a host some storage plugin publishes to. */
export function isPublicUrl(url: string, plugins: StoragePlugin[] = allStoragePlugins): boolean {
  const host = hostOf(url)
  if (!host) return false
  // A local manifest, for testing a share link in development
  if (import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1')) return true
  return Boolean(pluginFor(url, plugins))
}

const readers = new Map<string, Promise<PublicReader>>()

async function plainFetch(url: string): Promise<unknown> {
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * The JSON published at `url`, as stored — still sealed if it was sealed.
 * Throws when it cannot be read.
 */
export async function fetchPublicJson(
  url: string,
  plugins: StoragePlugin[] = allStoragePlugins
): Promise<unknown> {
  const plugin = pluginFor(url, plugins)
  if (!plugin?.publicReader) return plainFetch(url)

  let reader = readers.get(plugin.id)
  if (!reader) {
    reader = plugin.publicReader()
    // A reader that failed to load is retried next time, not cached broken
    reader.catch(() => readers.delete(plugin.id))
    readers.set(plugin.id, reader)
  }
  return (await reader).fetchJson(url)
}
