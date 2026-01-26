import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MigrationService } from '@/services/MigrationService'
import type { Migration, MigrationRecord } from '@/services/MigrationService'

// Mock IndexedDBService using FakeDB pattern
vi.mock('@/services/IndexedDBService', () => {
  class FakeDB {
    private stores: Record<string, any> = {
      settings: {}
    }

    async getData(key: string) {
      return this.stores.settings[key] || null
    }

    async saveData(key: string, value: any) {
      this.stores.settings[key] = value
    }

    // Helper for tests
    setData(key: string, value: any) {
      this.stores.settings[key] = value
    }

    clearData() {
      this.stores.settings = {}
    }
  }

  let instance: FakeDB | null = null

  return {
    IndexedDBService: {
      getInstance: async () => {
        if (!instance) instance = new FakeDB()
        return instance
      }
    }
  }
})

// Mock compareVersions utility
vi.mock('@/utils/semver', () => ({
  compareVersions: (a: string, b: string): number => {
    const [aMajor, aMinor, aPatch] = a.split('.').map(Number)
    const [bMajor, bMinor, bPatch] = b.split('.').map(Number)

    if (aMajor !== bMajor) return aMajor - bMajor
    if (aMinor !== bMinor) return aMinor - bMinor
    return aPatch - bPatch
  }
}))

describe('MigrationService', () => {
  let service: MigrationService

  beforeEach(() => {
    // Reset singleton
    // @ts-expect-error - accessing private property for testing
    MigrationService.instance = null
    service = MigrationService.getInstance()
  })

  afterEach(async () => {
    const { IndexedDBService } = await import('@/services/IndexedDBService')
    const db = await IndexedDBService.getInstance()
    // @ts-expect-error - clearData() is a test helper method
    db.clearData()
    vi.clearAllMocks()
  })

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = MigrationService.getInstance()
      const instance2 = MigrationService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('Migration Registration', () => {
    it('should register valid migration', () => {
      const migration: Migration = {
        version: '0.2.0',
        description: 'Test migration',
        up: vi.fn()
      }

      service.register(migration)

      const registered = service.getRegisteredMigrations()
      expect(registered).toHaveLength(1)
      expect(registered[0].version).toBe('0.2.0')
      expect(registered[0].description).toBe('Test migration')
    })

    it('should reject invalid version format', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const migration: Migration = {
        version: 'invalid',
        description: 'Bad migration',
        up: vi.fn()
      }

      service.register(migration)

      expect(consoleError).toHaveBeenCalled()
      expect(service.getRegisteredMigrations()).toHaveLength(0)
    })

    it('should reject version without patch number', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const migration: Migration = {
        version: '0.2',
        description: 'Missing patch',
        up: vi.fn()
      }

      service.register(migration)

      expect(consoleError).toHaveBeenCalled()
      expect(service.getRegisteredMigrations()).toHaveLength(0)
    })

    it('should reject duplicate versions', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const migration1: Migration = {
        version: '0.2.0',
        description: 'First',
        up: vi.fn()
      }

      const migration2: Migration = {
        version: '0.2.0',
        description: 'Duplicate',
        up: vi.fn()
      }

      service.register(migration1)
      service.register(migration2)

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      )
      expect(service.getRegisteredMigrations()).toHaveLength(1)
    })

    it('should sort migrations by version', () => {
      const m1: Migration = { version: '0.3.0', description: 'Third', up: vi.fn() }
      const m2: Migration = { version: '0.1.0', description: 'First', up: vi.fn() }
      const m3: Migration = { version: '0.2.0', description: 'Second', up: vi.fn() }

      service.register(m1)
      service.register(m2)
      service.register(m3)

      const registered = service.getRegisteredMigrations()
      expect(registered[0].version).toBe('0.1.0')
      expect(registered[1].version).toBe('0.2.0')
      expect(registered[2].version).toBe('0.3.0')
    })

    it('should log registration success', () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      const migration: Migration = {
        version: '0.2.0',
        description: 'Test',
        up: vi.fn()
      }

      service.register(migration)

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Registered migration: 0.2.0')
      )
    })
  })

  describe('Migration Execution', () => {
    it('should run pending migrations in order', async () => {
      const executionOrder: string[] = []

      const m1: Migration = {
        version: '0.2.0',
        description: 'First',
        up: vi.fn(async () => {
          executionOrder.push('0.2.0')
        })
      }

      const m2: Migration = {
        version: '0.3.0',
        description: 'Second',
        up: vi.fn(async () => {
          executionOrder.push('0.3.0')
        })
      }

      service.register(m1)
      service.register(m2)

      await service.runMigrations('0.1.0', '0.3.0')

      expect(executionOrder).toEqual(['0.2.0', '0.3.0'])
      expect(m1.up).toHaveBeenCalled()
      expect(m2.up).toHaveBeenCalled()
    })

    it('should skip migrations outside version range', async () => {
      const m1: Migration = { version: '0.1.0', description: 'Too old', up: vi.fn() }
      const m2: Migration = { version: '0.2.0', description: 'In range', up: vi.fn() }
      const m3: Migration = { version: '0.4.0', description: 'Too new', up: vi.fn() }

      service.register(m1)
      service.register(m2)
      service.register(m3)

      await service.runMigrations('0.1.0', '0.3.0')

      expect(m1.up).not.toHaveBeenCalled()
      expect(m2.up).toHaveBeenCalled()
      expect(m3.up).not.toHaveBeenCalled()
    })

    it('should include target version in range', async () => {
      const m1: Migration = { version: '0.2.0', description: 'Target', up: vi.fn() }

      service.register(m1)

      await service.runMigrations('0.1.0', '0.2.0')

      expect(m1.up).toHaveBeenCalled()
    })

    it('should record successful migrations', async () => {
      const migration: Migration = {
        version: '0.2.0',
        description: 'Test migration',
        up: vi.fn()
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      const history = await service.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].version).toBe('0.2.0')
      expect(history[0].description).toBe('Test migration')
      expect(history[0].success).toBe(true)
      expect(history[0].executedAt).toBeGreaterThan(0)
    })

    it('should stop on migration failure', async () => {
      const m1: Migration = {
        version: '0.2.0',
        description: 'Failing migration',
        up: vi.fn(async () => {
          throw new Error('Migration failed')
        })
      }

      const m2: Migration = {
        version: '0.3.0',
        description: 'Should NOT run',
        up: vi.fn()
      }

      service.register(m1)
      service.register(m2)

      // Should throw error and stop
      await expect(service.runMigrations('0.1.0', '0.3.0')).rejects.toThrow(
        'Migration 0.2.0 failed: Error: Migration failed'
      )

      expect(m1.up).toHaveBeenCalled()
      expect(m2.up).not.toHaveBeenCalled() // Stopped after first failure

      const history = await service.getHistory()
      expect(history.length).toBe(1)
      expect(history[0].success).toBe(false)
      expect(history[0].error).toContain('Migration failed')
    })

    it('should attempt rollback on failure if down() defined', async () => {
      const downFn = vi.fn()

      const migration: Migration = {
        version: '0.2.0',
        description: 'Failing with rollback',
        up: vi.fn(async () => {
          throw new Error('Failed')
        }),
        down: downFn
      }

      service.register(migration)

      // Should throw error after attempting rollback
      await expect(service.runMigrations('0.1.0', '0.2.0')).rejects.toThrow(
        'Migration 0.2.0 failed: Error: Failed'
      )

      expect(downFn).toHaveBeenCalled()
    })

    it('should handle rollback failure gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const migration: Migration = {
        version: '0.2.0',
        description: 'Rollback fails',
        up: vi.fn(async () => {
          throw new Error('Up failed')
        }),
        down: vi.fn(async () => {
          throw new Error('Rollback failed')
        })
      }

      service.register(migration)

      // Should throw error even if rollback fails
      await expect(service.runMigrations('0.1.0', '0.2.0')).rejects.toThrow(
        'Migration 0.2.0 failed: Error: Up failed'
      )

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Rollback failed'),
        expect.any(Error)
      )
    })

    it('should log migration start and completion', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      const migration: Migration = {
        version: '0.2.0',
        description: 'Test',
        up: vi.fn()
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Running 1 migrations')
      )
      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Migration 0.2.0 completed')
      )
    })
  })

  describe('Event Emission', () => {
    it('should emit migration-started', () => {
      return new Promise<void>((resolve) => {
        const migration: Migration = {
          version: '0.2.0',
          description: 'Test',
          up: vi.fn()
        }

        service.register(migration)

        service.emitter.addEventListener('migration-started', (evt) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('migration-started')
          expect(customEvent.detail.fromVersion).toBe('0.1.0')
          expect(customEvent.detail.toVersion).toBe('0.2.0')
          resolve()
        })

        service.runMigrations('0.1.0', '0.2.0')
      })
    })

    it('should emit migration-progress', () => {
      return new Promise<void>((resolve) => {
        const migration: Migration = {
          version: '0.2.0',
          description: 'Test progress',
          up: vi.fn()
        }

        service.register(migration)

        service.emitter.addEventListener('migration-progress', (evt) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('migration-progress')
          expect(customEvent.detail.currentMigration).toBe('Test progress')
          expect(customEvent.detail.progress).toBeGreaterThanOrEqual(0)
          expect(customEvent.detail.progress).toBeLessThanOrEqual(100)
          resolve()
        })

        service.runMigrations('0.1.0', '0.2.0')
      })
    })

    it('should emit migration-completed', () => {
      return new Promise<void>((resolve) => {
        const migration: Migration = {
          version: '0.2.0',
          description: 'Test',
          up: vi.fn()
        }

        service.register(migration)

        service.emitter.addEventListener('migration-completed', (evt) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('migration-completed')
          expect(customEvent.detail.fromVersion).toBe('0.1.0')
          expect(customEvent.detail.toVersion).toBe('0.2.0')
          expect(customEvent.detail.progress).toBe(100)
          resolve()
        })

        service.runMigrations('0.1.0', '0.2.0')
      })
    })

    it('should emit migration-failed on error', () => {
      return new Promise<void>((resolve, reject) => {
        const migration: Migration = {
          version: '0.2.0',
          description: 'Failing',
          up: vi.fn(async () => {
            throw new Error('Test error')
          })
        }

        service.register(migration)

        service.emitter.addEventListener('migration-failed', (evt) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('migration-failed')
          expect(customEvent.detail.error).toContain('Test error')
          expect(customEvent.detail.failedMigration).toBe('0.2.0')
          resolve()
        })

        // runMigrations will throw error after emitting event
        service.runMigrations('0.1.0', '0.2.0').catch(() => {
          // Expected to throw, already resolved by event listener
        })
      })
    })

    it('should calculate progress correctly', () => {
      return new Promise<void>((resolve) => {
        const m1: Migration = { version: '0.2.0', description: 'First', up: vi.fn() }
        const m2: Migration = { version: '0.3.0', description: 'Second', up: vi.fn() }

        service.register(m1)
        service.register(m2)

        const progressValues: number[] = []

        service.emitter.addEventListener('migration-progress', (evt) => {
          const customEvent = evt as CustomEvent
          progressValues.push(customEvent.detail.progress)
        })

        service.emitter.addEventListener('migration-completed', () => {
          expect(progressValues.length).toBe(2)
          expect(progressValues[0]).toBe(0) // First migration: 0/2 * 100
          expect(progressValues[1]).toBe(50) // Second migration: 1/2 * 100
          resolve()
        })

        service.runMigrations('0.1.0', '0.3.0')
      })
    })
  })

  describe('Migration History', () => {
    it('should return empty array if no migrations run', async () => {
      const history = await service.getHistory()
      expect(history).toEqual([])
    })

    it('should return migration history', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db = await IndexedDBService.getInstance()

      const mockHistory: MigrationRecord[] = [
        {
          version: '0.2.0',
          description: 'Test',
          executedAt: Date.now(),
          success: true
        }
      ]

      // @ts-expect-error - setData() is a test helper method
      db.setData('migration_history', mockHistory)

      const history = await service.getHistory()
      expect(history).toEqual(mockHistory)
    })

    it('should append to existing history', async () => {
      const { IndexedDBService } = await import('@/services/IndexedDBService')
      const db = await IndexedDBService.getInstance()

      // Pre-populate history
      // @ts-expect-error - setData() is a test helper method
      db.setData('migration_history', [
        {
          version: '0.1.0',
          description: 'Old',
          executedAt: Date.now() - 1000,
          success: true
        }
      ])

      const migration: Migration = {
        version: '0.2.0',
        description: 'New',
        up: vi.fn()
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      const history = await service.getHistory()
      expect(history).toHaveLength(2)
      expect(history[0].version).toBe('0.1.0')
      expect(history[1].version).toBe('0.2.0')
    })
  })

  describe('Manual Rollback', () => {
    it('should rollback last migration', async () => {
      const downFn = vi.fn()

      const migration: Migration = {
        version: '0.2.0',
        description: 'To rollback',
        up: vi.fn(),
        down: downFn
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      await service.rollback()

      expect(downFn).toHaveBeenCalled()
    })

    it('should remove migration from history after rollback', async () => {
      const migration: Migration = {
        version: '0.2.0',
        description: 'To rollback',
        up: vi.fn(),
        down: vi.fn()
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      let history = await service.getHistory()
      expect(history).toHaveLength(1)

      await service.rollback()

      history = await service.getHistory()
      expect(history).toHaveLength(0)
    })

    it('should handle no migrations to rollback', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.rollback()

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No migrations to rollback')
      )
    })

    it('should handle missing down() method', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const migration: Migration = {
        version: '0.2.0',
        description: 'No rollback',
        up: vi.fn()
        // No down() defined
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      await service.rollback()

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('Cannot rollback 0.2.0')
      )
    })

    it('should handle rollback errors', async () => {
      const migration: Migration = {
        version: '0.2.0',
        description: 'Rollback error',
        up: vi.fn(),
        down: vi.fn(async () => {
          throw new Error('Rollback failed')
        })
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      await expect(service.rollback()).rejects.toThrow('Rollback failed')
    })

    it('should log rollback success', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      const migration: Migration = {
        version: '0.2.0',
        description: 'Test',
        up: vi.fn(),
        down: vi.fn()
      }

      service.register(migration)
      await service.runMigrations('0.1.0', '0.2.0')

      await service.rollback()

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Rollback successful')
      )
    })
  })

  describe('No Pending Migrations', () => {
    it('should handle no migrations needed', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.runMigrations('0.1.0', '0.1.0')

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('No migrations needed')
      )
    })

    it('should not emit events if no migrations', async () => {
      let startedEmitted = false
      let completedEmitted = false

      service.emitter.addEventListener('migration-started', () => {
        startedEmitted = true
      })

      service.emitter.addEventListener('migration-completed', () => {
        completedEmitted = true
      })

      await service.runMigrations('0.1.0', '0.1.0')

      expect(startedEmitted).toBe(false)
      expect(completedEmitted).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple migrations with same major version', async () => {
      const m1: Migration = { version: '0.2.0', description: 'A', up: vi.fn() }
      const m2: Migration = { version: '0.2.1', description: 'B', up: vi.fn() }
      const m3: Migration = { version: '0.2.2', description: 'C', up: vi.fn() }

      service.register(m1)
      service.register(m2)
      service.register(m3)

      await service.runMigrations('0.1.0', '0.2.2')

      expect(m1.up).toHaveBeenCalled()
      expect(m2.up).toHaveBeenCalled()
      expect(m3.up).toHaveBeenCalled()
    })

    it('should handle version with leading zeros', async () => {
      const migration: Migration = {
        version: '0.02.0',
        description: 'Leading zero',
        up: vi.fn()
      }

      service.register(migration)

      const registered = service.getRegisteredMigrations()
      expect(registered).toHaveLength(1)
    })

    it('should handle large version numbers', async () => {
      const migration: Migration = {
        version: '10.20.30',
        description: 'Large',
        up: vi.fn()
      }

      service.register(migration)
      await service.runMigrations('9.0.0', '11.0.0')

      expect(migration.up).toHaveBeenCalled()
    })

    it('should preserve history across multiple runs', async () => {
      const m1: Migration = { version: '0.2.0', description: 'First', up: vi.fn() }

      service.register(m1)
      await service.runMigrations('0.1.0', '0.2.0')

      // Register and run another migration
      const m2: Migration = { version: '0.3.0', description: 'Second', up: vi.fn() }

      service.register(m2)
      await service.runMigrations('0.2.0', '0.3.0')

      const history = await service.getHistory()
      expect(history).toHaveLength(2)
    })
  })
})
