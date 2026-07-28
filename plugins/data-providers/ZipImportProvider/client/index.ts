import type { ProviderPlugin } from '@/types/provider'

/**
 * Deprecated: a strict duplicate of the Strava provider.
 *
 * Both read the `activities.csv` at the root of a Strava bulk export through
 * JSZip — same input, same file, same mechanism. The Strava one locates the CSV
 * defensively rather than assuming the root, and, unlike this one, maps its
 * sport values onto the canonical vocabulary. This one just lowercased whatever
 * the file said, so "Trail Running" became "trail running", fell through to the
 * `other` profile and lost its headline metric.
 *
 * Kept resolvable rather than deleted: anyone who already imported this way
 * keeps a working setup page, and their activities keep their provenance.
 */
const ZipImportProvider: ProviderPlugin = {
  id: 'zip-import',
  label: 'Import ZIP',
  deprecated: true,
  setupComponent: async () => (await import('./Setup.vue')).default
}

export default ZipImportProvider
