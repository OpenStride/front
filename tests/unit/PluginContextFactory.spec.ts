import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FakeDB, createFakeDBModule } from '../helpers/FakeDB'

// Mock all dependencies
vi.mock('@/services/IndexedDBService', () => createFakeDBModule())

vi.mock('@/services/ActivityService', () => ({
  getActivityService: vi.fn().mockResolvedValue({
    saveActivityWithDetails: vi.fn(),
    saveActivitiesWithDetails: vi.fn(),
    getActivity: vi.fn(),
    getAllActivities: vi.fn().mockResolvedValue([]),
    getDetails: vi.fn(),
    deleteActivity: vi.fn(),
    getUnsyncedActivities: vi.fn().mockResolvedValue([]),
    markAsSynced: vi.fn()
  })
}))

vi.mock('@/services/ToastService', () => ({
  ToastService: {
    push: vi.fn()
  }
}))

vi.mock('@/services/AggregationService', () => ({
  aggregationService: {
    getAggregated: vi.fn().mockResolvedValue([]),
    listMetrics: vi.fn().mockReturnValue([])
  }
}))

vi.mock('@/services/FriendService', () => ({
  FriendService: {
    getInstance: vi.fn().mockReturnValue({
      publishPublicData: vi.fn().mockResolvedValue(null),
      getMyManifestUrl: vi.fn().mockResolvedValue(null)
    })
  }
}))

vi.mock('@/services/DataProviderPluginManager', () => ({
  DataProviderPluginManager: {
    getInstance: vi.fn().mockReturnValue({
      getEnabledPlugins: vi.fn().mockResolvedValue([])
    })
  }
}))

vi.mock('@/services/StoragePluginManager', () => ({
  StoragePluginManager: {
    getInstance: vi.fn().mockReturnValue({
      getEnabledPlugins: vi.fn().mockResolvedValue([])
    })
  }
}))

vi.mock('@/services/ActivityAnalyzer', () => {
  class MockActivityAnalyzer {
    bestSegments = vi.fn().mockReturnValue({})
    sampleAverageByDistance = vi.fn().mockReturnValue([])
    sampleBySlopeChange = vi.fn().mockReturnValue([])
    sampleByLaps = vi.fn().mockReturnValue([])
    constructor(_samples: any[]) {}
  }
  return { ActivityAnalyzer: MockActivityAnalyzer }
})

describe('PluginContextFactory', () => {
  beforeEach(() => {
    FakeDB.resetInstance()
    vi.resetModules()
  })

  it('creates a context with all expected interfaces', async () => {
    const { createPluginContext, clearPluginContext } =
      await import('@/services/PluginContextFactory')
    clearPluginContext()
    const ctx = await createPluginContext()

    expect(ctx).toHaveProperty('activity')
    expect(ctx).toHaveProperty('storage')
    expect(ctx).toHaveProperty('notifications')
    expect(ctx).toHaveProperty('plugins')
    expect(ctx).toHaveProperty('aggregation')
    expect(ctx).toHaveProperty('friends')
    expect(ctx).toHaveProperty('analyzer')
  })

  describe('ctx.activity', () => {
    it('exposes getAllActivities', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()
      const activities = await ctx.activity.getAllActivities()
      expect(Array.isArray(activities)).toBe(true)
    })
  })

  describe('ctx.storage', () => {
    it('exposes getData and saveData', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()

      await ctx.storage.saveData('testKey', 'testValue')
      const result = await ctx.storage.getData('testKey')
      expect(result).toBe('testValue')
    })
  })

  describe('ctx.notifications', () => {
    it('exposes notify method', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()

      expect(typeof ctx.notifications.notify).toBe('function')
      ctx.notifications.notify('test message', { type: 'success' })

      const { ToastService } = await import('@/services/ToastService')
      expect(ToastService.push).toHaveBeenCalledWith('test message', { type: 'success' })
    })
  })

  describe('ctx.plugins', () => {
    it('exposes isPluginActive and enablePlugin', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()

      expect(typeof ctx.plugins.isPluginActive).toBe('function')
      expect(typeof ctx.plugins.enablePlugin).toBe('function')
    })
  })

  describe('ctx.aggregation', () => {
    it('exposes getAggregated and listMetrics', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()

      expect(typeof ctx.aggregation.getAggregated).toBe('function')
      expect(typeof ctx.aggregation.listMetrics).toBe('function')

      const metrics = ctx.aggregation.listMetrics()
      expect(Array.isArray(metrics)).toBe(true)
    })
  })

  describe('ctx.friends', () => {
    it('exposes publishPublicData and getMyManifestUrl', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()

      expect(typeof ctx.friends.publishPublicData).toBe('function')
      expect(typeof ctx.friends.getMyManifestUrl).toBe('function')
    })
  })

  describe('ctx.analyzer', () => {
    it('creates an analyzer with all methods', async () => {
      const { createPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx = await createPluginContext()

      const analyzer = ctx.analyzer.create([])
      expect(typeof analyzer.bestSegments).toBe('function')
      expect(typeof analyzer.sampleAverageByDistance).toBe('function')
      expect(typeof analyzer.sampleBySlopeChange).toBe('function')
      expect(typeof analyzer.sampleByLaps).toBe('function')
    })
  })

  describe('getPluginContext singleton', () => {
    it('returns the same instance on subsequent calls', async () => {
      const { getPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx1 = await getPluginContext()
      const ctx2 = await getPluginContext()
      expect(ctx1).toBe(ctx2)
    })

    it('returns new instance after clearPluginContext', async () => {
      const { getPluginContext, clearPluginContext } =
        await import('@/services/PluginContextFactory')
      clearPluginContext()
      const ctx1 = await getPluginContext()
      clearPluginContext()
      const ctx2 = await getPluginContext()
      expect(ctx1).not.toBe(ctx2)
    })
  })
})
