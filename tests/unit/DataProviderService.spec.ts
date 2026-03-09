import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DataProviderPluginManager
const mockGetMyDataProviderPlugins = vi.fn()
vi.mock('@/services/DataProviderPluginManager', () => ({
  DataProviderPluginManager: {
    getInstance: () => ({
      getMyDataProviderPlugins: mockGetMyDataProviderPlugins
    })
  }
}))

import { DataProviderService } from '@/services/DataProviderService'

describe('DataProviderService', () => {
  let service: DataProviderService

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton
    ;(DataProviderService as any).instance = undefined
    service = DataProviderService.getInstance()
  })

  describe('triggerRefresh', () => {
    it('calls refreshData on each enabled plugin', async () => {
      const plugin1 = { id: 'garmin', label: 'Garmin', refreshData: vi.fn() }
      const plugin2 = { id: 'coros', label: 'Coros', refreshData: vi.fn() }
      mockGetMyDataProviderPlugins.mockResolvedValue([plugin1, plugin2])

      await service.triggerRefresh()

      expect(plugin1.refreshData).toHaveBeenCalledOnce()
      expect(plugin2.refreshData).toHaveBeenCalledOnce()
    })

    it('emits provider-activities-imported after each successful refresh', async () => {
      const plugin = { id: 'garmin', label: 'Garmin', refreshData: vi.fn() }
      mockGetMyDataProviderPlugins.mockResolvedValue([plugin])

      const events: CustomEvent[] = []
      service.emitter.addEventListener('provider-activities-imported', (e) => {
        events.push(e as CustomEvent)
      })

      await service.triggerRefresh()

      expect(events).toHaveLength(1)
      expect(events[0].detail.providerId).toBe('garmin')
      expect(events[0].detail.providerLabel).toBe('Garmin')
      expect(events[0].detail.timestamp).toBeTypeOf('number')
    })

    it('skips plugins without refreshData method', async () => {
      const pluginWithout = { id: 'zip', label: 'Zip Import' } // no refreshData
      const pluginWith = { id: 'garmin', label: 'Garmin', refreshData: vi.fn() }
      mockGetMyDataProviderPlugins.mockResolvedValue([pluginWithout, pluginWith])

      await service.triggerRefresh()

      expect(pluginWith.refreshData).toHaveBeenCalledOnce()
    })

    it('continues with next plugin when one fails', async () => {
      const failingPlugin = {
        id: 'garmin',
        label: 'Garmin',
        refreshData: vi.fn().mockRejectedValue(new Error('API error'))
      }
      const successPlugin = {
        id: 'coros',
        label: 'Coros',
        refreshData: vi.fn()
      }
      mockGetMyDataProviderPlugins.mockResolvedValue([failingPlugin, successPlugin])

      await service.triggerRefresh()

      expect(failingPlugin.refreshData).toHaveBeenCalledOnce()
      expect(successPlugin.refreshData).toHaveBeenCalledOnce()
    })

    it('does not emit event when plugin fails', async () => {
      const failingPlugin = {
        id: 'garmin',
        label: 'Garmin',
        refreshData: vi.fn().mockRejectedValue(new Error('fail'))
      }
      mockGetMyDataProviderPlugins.mockResolvedValue([failingPlugin])

      const events: Event[] = []
      service.emitter.addEventListener('provider-activities-imported', (e) => events.push(e))

      await service.triggerRefresh()

      expect(events).toHaveLength(0)
    })

    it('handles no plugins gracefully', async () => {
      mockGetMyDataProviderPlugins.mockResolvedValue([])

      await expect(service.triggerRefresh()).resolves.toBeUndefined()
    })
  })
})
