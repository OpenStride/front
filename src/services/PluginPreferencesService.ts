/**
 * PluginPreferencesService
 *
 * Stores the preferences plugins declare, and seeds their defaults at install
 * time only.
 *
 * The seeding rule is the whole point of the service: a default is written when
 * a plugin is installed *and* the key holds no value. It is never written again
 * — not on app start, not on read, not when the plugin is re-enabled after
 * having been disabled. Once the user has a value, it is theirs.
 *
 * Values live in a single `plugin_preferences` settings record so the whole set
 * moves as one unit through export and remote hydration. Writes are serialized
 * because each one is a read-modify-write of that record.
 */

import { IndexedDBService } from './IndexedDBService'
import {
  resolvePreferenceKey,
  type PluginPreferenceDeclaration,
  type PluginPreferenceValue
} from '@/types/plugin-preferences'

const STORAGE_KEY = 'plugin_preferences'

export type PreferencesMap = Record<string, PluginPreferenceValue>

export class PluginPreferencesService {
  private static instance: PluginPreferencesService | null = null

  private cache: PreferencesMap | null = null
  /** Serializes read-modify-write cycles on the single settings record. */
  private writeChain: Promise<unknown> = Promise.resolve()

  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static getInstance(): PluginPreferencesService {
    if (!PluginPreferencesService.instance) {
      PluginPreferencesService.instance = new PluginPreferencesService()
    }
    return PluginPreferencesService.instance
  }

  /** Drop the in-memory cache. Used by tests and after a remote hydration. */
  public invalidate(): void {
    this.cache = null
  }

  private async load(): Promise<PreferencesMap> {
    if (this.cache) return this.cache

    const db = await IndexedDBService.getInstance()
    const stored = await db.getData<PreferencesMap>(STORAGE_KEY)
    this.cache = stored && typeof stored === 'object' ? { ...stored } : {}
    return this.cache
  }

  /**
   * Run a read-modify-write against the stored record, one at a time.
   * Concurrent installs would otherwise each persist a copy of the map they
   * read before the other wrote, losing one of the two updates.
   */
  private async mutate<R>(
    fn: (current: PreferencesMap) => { next: PreferencesMap; result: R }
  ): Promise<R> {
    const run = this.writeChain.then(async () => {
      const current = await this.load()
      const { next, result } = fn({ ...current })

      const db = await IndexedDBService.getInstance()
      await db.saveData(STORAGE_KEY, next)
      this.cache = next

      return result
    })

    // Keep the chain alive even if this link rejects, so one failed write does
    // not wedge every later one.
    this.writeChain = run.catch(() => undefined)
    return run
  }

  private emitChange(keys: string[]): void {
    if (!keys.length) return
    this.emitter.dispatchEvent(new CustomEvent('preferences-changed', { detail: { keys } }))
  }

  // ========== RAW ACCESS (resolved storage keys) ==========

  public async getAll(): Promise<PreferencesMap> {
    return { ...(await this.load()) }
  }

  public async get<T = PluginPreferenceValue>(storageKey: string): Promise<T | undefined> {
    const prefs = await this.load()
    return Object.prototype.hasOwnProperty.call(prefs, storageKey)
      ? (prefs[storageKey] as T)
      : undefined
  }

  public async has(storageKey: string): Promise<boolean> {
    const prefs = await this.load()
    return Object.prototype.hasOwnProperty.call(prefs, storageKey)
  }

  public async set(storageKey: string, value: PluginPreferenceValue): Promise<void> {
    await this.mutate(current => ({
      next: { ...current, [storageKey]: value },
      result: undefined
    }))
    this.emitChange([storageKey])
  }

  public async remove(storageKey: string): Promise<void> {
    const existed = await this.has(storageKey)
    if (!existed) return

    await this.mutate(current => {
      const next = { ...current }
      delete next[storageKey]
      return { next, result: undefined }
    })
    this.emitChange([storageKey])
  }

  // ========== PLUGIN-FACING ACCESS ==========
  // The PluginContext is a singleton shared by every plugin, so it cannot infer
  // the caller: the plugin id is passed explicitly.

  public async getPluginPreference<T = PluginPreferenceValue>(
    pluginId: string,
    key: string
  ): Promise<T | undefined> {
    return this.get<T>(resolvePreferenceKey(pluginId, { key }))
  }

  public async setPluginPreference(
    pluginId: string,
    key: string,
    value: PluginPreferenceValue
  ): Promise<void> {
    return this.set(resolvePreferenceKey(pluginId, { key }), value)
  }

  public async getShared<T = PluginPreferenceValue>(key: string): Promise<T | undefined> {
    return this.get<T>(resolvePreferenceKey('', { key, shared: true }))
  }

  public async setShared(key: string, value: PluginPreferenceValue): Promise<void> {
    return this.set(resolvePreferenceKey('', { key, shared: true }), value)
  }

  // ========== INSTALL-TIME SEEDING ==========

  /**
   * Write the defaults a plugin declares, for the keys that hold no value yet.
   *
   * Call this only when a plugin is installed. Returns the keys actually
   * written, which is empty when every preference was already decided — the
   * normal outcome for a shared key a previously installed plugin claimed.
   */
  public async seedDefaults(
    pluginId: string,
    declarations: PluginPreferenceDeclaration[]
  ): Promise<string[]> {
    if (!declarations.length) return []

    const seeded = await this.mutate(current => {
      const next = { ...current }
      const written: string[] = []

      for (const declaration of declarations) {
        const storageKey = resolvePreferenceKey(pluginId, declaration)
        if (Object.prototype.hasOwnProperty.call(next, storageKey)) continue

        next[storageKey] = declaration.default
        written.push(storageKey)
      }

      return { next, result: written }
    })

    if (seeded.length) {
      console.log(`[PluginPreferences] Seeded defaults for "${pluginId}":`, seeded.join(', '))
    }
    this.emitChange(seeded)
    return seeded
  }
}

export function getPluginPreferencesService(): PluginPreferencesService {
  return PluginPreferencesService.getInstance()
}
