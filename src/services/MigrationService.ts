/**
 * Migration Service
 *
 * Executes app-level migrations based on version upgrades.
 * Complements IndexedDB schema migrations with application-level data transformations.
 *
 * Architecture:
 * - Event-driven: emits progress events for UI feedback
 * - Atomic execution with rollback support
 * - Records migration history in IndexedDB
 * - Singleton pattern
 */

import { IndexedDBService } from './IndexedDBService'
import { compareVersions } from '@/utils/semver'

export interface Migration {
  version: string // Target version (e.g., "0.2.0")
  description: string // Human-readable description
  up: () => Promise<void> // Forward migration
  down?: () => Promise<void> // Rollback (optional)
}

export interface MigrationRecord {
  version: string
  description: string
  executedAt: number
  success: boolean
  error?: string
}

export interface MigrationEvent {
  type:
    | 'migration-started' // Migration sequence started
    | 'migration-progress' // Individual migration running
    | 'migration-completed' // All migrations done
    | 'migration-failed' // Migration error (rollback)
  fromVersion?: string
  toVersion?: string
  currentMigration?: string
  progress?: number // 0-100
  error?: string
}

export class MigrationService {
  private static instance: MigrationService | null = null
  private migrations: Migration[] = []
  public emitter = new EventTarget()

  private constructor() {}

  public static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService()
    }
    return MigrationService.instance
  }

  /**
   * Register a migration
   */
  public register(migration: Migration): void {
    // Validate version format
    try {
      const versionRegex = /^\d+\.\d+\.\d+$/
      if (!versionRegex.test(migration.version)) {
        throw new Error(`Invalid version format: ${migration.version}`)
      }
    } catch (error) {
      console.error('[MigrationService] Invalid migration:', error)
      return
    }

    // Check for duplicate versions
    const existing = this.migrations.find(m => m.version === migration.version)
    if (existing) {
      console.warn(
        `[MigrationService] Migration for version ${migration.version} already registered`
      )
      return
    }

    this.migrations.push(migration)
    console.log(
      `[MigrationService] Registered migration: ${migration.version} - ${migration.description}`
    )
  }

  /**
   * Run all pending migrations from fromVersion to toVersion
   */
  public async runMigrations(fromVersion: string, toVersion: string): Promise<void> {
    const db = await IndexedDBService.getInstance()

    // Get pending migrations
    const pending = this.migrations
      .filter(m => {
        const afterFrom = compareVersions(m.version, fromVersion) > 0
        const beforeOrEqualTo = compareVersions(m.version, toVersion) <= 0
        return afterFrom && beforeOrEqualTo
      })
      .sort((a, b) => compareVersions(a.version, b.version))

    if (pending.length === 0) {
      console.log('[MigrationService] No migrations needed')
      return
    }

    console.log(`[MigrationService] Running ${pending.length} migrations...`)

    this.emitter.dispatchEvent(
      new CustomEvent<MigrationEvent>('migration-started', {
        detail: {
          type: 'migration-started',
          fromVersion,
          toVersion
        }
      })
    )

    // Get or initialize migration history
    let history: MigrationRecord[] = (await db.getData('migration_history')) || []

    for (let i = 0; i < pending.length; i++) {
      const migration = pending[i]

      try {
        console.log(
          `[MigrationService] [${i + 1}/${pending.length}] Running: ${migration.version} - ${migration.description}`
        )

        this.emitter.dispatchEvent(
          new CustomEvent<MigrationEvent>('migration-progress', {
            detail: {
              type: 'migration-progress',
              currentMigration: migration.description,
              progress: Math.round((i / pending.length) * 100)
            }
          })
        )

        // Execute migration
        await migration.up()

        // Record success
        const record: MigrationRecord = {
          version: migration.version,
          description: migration.description,
          executedAt: Date.now(),
          success: true
        }
        history.push(record)
        await db.saveData('migration_history', history)

        console.log(`[MigrationService] ✅ Migration ${migration.version} completed`)
      } catch (error) {
        console.error(`[MigrationService] ❌ Migration ${migration.version} failed:`, error)

        // Attempt rollback if defined
        if (migration.down) {
          try {
            console.log(`[MigrationService] Attempting rollback for ${migration.version}...`)
            await migration.down()
            console.log(`[MigrationService] ⏪ Rollback successful for ${migration.version}`)
          } catch (rollbackError) {
            console.error(`[MigrationService] ❌ Rollback failed:`, rollbackError)
          }
        }

        // Record failure
        const record: MigrationRecord = {
          version: migration.version,
          description: migration.description,
          executedAt: Date.now(),
          success: false,
          error: String(error)
        }
        history.push(record)
        await db.saveData('migration_history', history)

        this.emitter.dispatchEvent(
          new CustomEvent<MigrationEvent>('migration-failed', {
            detail: {
              type: 'migration-failed',
              error: String(error)
            }
          })
        )

        // Continue with remaining migrations (graceful degradation)
        console.log('[MigrationService] Continuing with remaining migrations...')
      }
    }

    this.emitter.dispatchEvent(
      new CustomEvent<MigrationEvent>('migration-completed', {
        detail: {
          type: 'migration-completed',
          fromVersion,
          toVersion,
          progress: 100
        }
      })
    )

    console.log('[MigrationService] All migrations completed')
  }

  /**
   * Get migration history
   */
  public async getHistory(): Promise<MigrationRecord[]> {
    const db = await IndexedDBService.getInstance()
    return (await db.getData('migration_history')) || []
  }

  /**
   * Emergency rollback of last migration
   */
  public async rollback(): Promise<void> {
    const history = await this.getHistory()
    if (history.length === 0) {
      console.log('[MigrationService] No migrations to rollback')
      return
    }

    const lastMigration = history[history.length - 1]
    const migration = this.migrations.find(m => m.version === lastMigration.version)

    if (!migration || !migration.down) {
      console.error(
        `[MigrationService] Cannot rollback ${lastMigration.version}: no down() defined`
      )
      return
    }

    try {
      console.log(`[MigrationService] Rolling back ${lastMigration.version}...`)
      await migration.down()
      console.log(`[MigrationService] ✅ Rollback successful`)

      // Remove from history
      history.pop()
      const db = await IndexedDBService.getInstance()
      await db.saveData('migration_history', history)
    } catch (error) {
      console.error(`[MigrationService] ❌ Rollback failed:`, error)
      throw error
    }
  }

  /**
   * Get list of registered migrations
   */
  public getRegisteredMigrations(): Migration[] {
    return [...this.migrations].sort((a, b) => compareVersions(a.version, b.version))
  }
}

// Export singleton getter
export function getMigrationService(): MigrationService {
  return MigrationService.getInstance()
}
