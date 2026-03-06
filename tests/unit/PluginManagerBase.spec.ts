import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'

vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

// Concrete subclass for testing
class TestPluginManager extends (await import('@/services/PluginManagerBase')).PluginManagerBase<{
  id: string
  label: string
}> {
  protected readonly storageKey = 'testEnabledPlugins'
  protected readonly allPlugins = [
    { id: 'alpha', label: 'Alpha' },
    { id: 'beta', label: 'Beta' },
    { id: 'gamma', label: 'Gamma' }
  ]
  protected readonly defaultPlugins = ['alpha']

  protected getPluginId(plugin: { id: string }): string {
    return plugin.id
  }
}

describe('PluginManagerBase', () => {
  let manager: TestPluginManager
  let db: FakeDB

  beforeEach(async () => {
    FakeDB.resetInstance()
    db = (await FakeDB.getInstance()) as FakeDB
    db.reset()
    manager = new TestPluginManager()
  })

  describe('getEnabledPluginIds', () => {
    it('returns defaults when no data in IndexedDB', async () => {
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toEqual(['alpha'])
    })

    it('returns stored IDs when data exists', async () => {
      await db.saveData('testEnabledPlugins', ['beta', 'gamma'])
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toEqual(['beta', 'gamma'])
    })

    it('returns defaults for non-array stored data', async () => {
      await db.saveData('testEnabledPlugins', 'not-an-array')
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toEqual(['alpha'])
    })
  })

  describe('enablePlugin', () => {
    it('adds plugin to enabled list', async () => {
      await manager.enablePlugin('beta')
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toContain('beta')
    })

    it('does not duplicate if already enabled', async () => {
      await db.saveData('testEnabledPlugins', ['alpha'])
      await manager.enablePlugin('alpha')
      const ids = await manager.getEnabledPluginIds()
      expect(ids.filter(id => id === 'alpha')).toHaveLength(1)
    })
  })

  describe('disablePlugin', () => {
    it('removes plugin from enabled list', async () => {
      await db.saveData('testEnabledPlugins', ['alpha', 'beta'])
      await manager.disablePlugin('alpha')
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toEqual(['beta'])
    })

    it('is a no-op for non-enabled plugin', async () => {
      await db.saveData('testEnabledPlugins', ['alpha'])
      await manager.disablePlugin('gamma')
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toEqual(['alpha'])
    })
  })

  describe('togglePlugin', () => {
    it('disables an enabled plugin', async () => {
      await db.saveData('testEnabledPlugins', ['alpha', 'beta'])
      const result = await manager.togglePlugin('alpha')
      expect(result).toBe(false)
      const ids = await manager.getEnabledPluginIds()
      expect(ids).not.toContain('alpha')
    })

    it('enables a disabled plugin', async () => {
      await db.saveData('testEnabledPlugins', ['alpha'])
      const result = await manager.togglePlugin('beta')
      expect(result).toBe(true)
      const ids = await manager.getEnabledPluginIds()
      expect(ids).toContain('beta')
    })
  })

  describe('isPluginEnabled', () => {
    it('returns true for enabled plugin', async () => {
      await db.saveData('testEnabledPlugins', ['alpha', 'beta'])
      expect(await manager.isPluginEnabled('alpha')).toBe(true)
    })

    it('returns false for disabled plugin', async () => {
      await db.saveData('testEnabledPlugins', ['alpha'])
      expect(await manager.isPluginEnabled('gamma')).toBe(false)
    })
  })

  describe('getEnabledPlugins', () => {
    it('returns plugin objects for enabled IDs', async () => {
      await db.saveData('testEnabledPlugins', ['alpha', 'gamma'])
      const plugins = await manager.getEnabledPlugins()
      expect(plugins).toHaveLength(2)
      expect(plugins.map(p => p.id)).toEqual(['alpha', 'gamma'])
    })

    it('filters out IDs that do not exist in allPlugins', async () => {
      await db.saveData('testEnabledPlugins', ['alpha', 'nonexistent'])
      const plugins = await manager.getEnabledPlugins()
      expect(plugins).toHaveLength(1)
      expect(plugins[0].id).toBe('alpha')
    })
  })

  describe('persistence', () => {
    it('persists enabled plugins across calls', async () => {
      await manager.enablePlugin('beta')
      await manager.enablePlugin('gamma')

      // Create a new manager instance — should read from same DB
      const manager2 = new TestPluginManager()
      const ids = await manager2.getEnabledPluginIds()
      expect(ids).toContain('beta')
      expect(ids).toContain('gamma')
    })
  })

  describe('getAllPlugins / getPluginById', () => {
    it('getAllPlugins returns all available plugins', () => {
      expect(manager.getAllPlugins()).toHaveLength(3)
    })

    it('getPluginById returns matching plugin', () => {
      const plugin = manager.getPluginById('beta')
      expect(plugin).toEqual({ id: 'beta', label: 'Beta' })
    })

    it('getPluginById returns undefined for unknown ID', () => {
      expect(manager.getPluginById('unknown')).toBeUndefined()
    })
  })
})
