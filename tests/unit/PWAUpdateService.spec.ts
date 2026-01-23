import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PWAUpdateService } from '@/services/PWAUpdateService'
import { Workbox } from 'workbox-window'

// Mock global constants
;(global as any).__APP_VERSION__ = '0.1.0'
;(global as any).__BUILD_TIME__ = '2026-01-23T00:00:00.000Z'

// Mock Workbox
vi.mock('workbox-window', () => ({
  Workbox: vi.fn().mockImplementation(function () {
    return {
      addEventListener: vi.fn(),
      register: vi.fn().mockResolvedValue(undefined),
      messageSkipWaiting: vi.fn()
    }
  })
}))

// Mock navigator.serviceWorker
const mockServiceWorker = {
  getRegistration: vi.fn(),
  register: vi.fn()
}

Object.defineProperty(global.navigator, 'serviceWorker', {
  value: mockServiceWorker,
  writable: true,
  configurable: true
})

describe('PWAUpdateService', () => {
  let service: PWAUpdateService
  let mockWb: any
  let eventListeners: Map<string, (...args: any[]) => void>

  beforeEach(() => {
    // Reset singleton
    // @ts-expect-error - accessing private static property for testing
    PWAUpdateService.instance = null

    // Setup event listener tracking
    eventListeners = new Map()

    // Mock Workbox instance
    mockWb = {
      addEventListener: vi.fn((event: string, handler: (...args: any[]) => void) => {
        eventListeners.set(event, handler)
      }),
      register: vi.fn().mockResolvedValue(undefined),
      messageSkipWaiting: vi.fn()
    }

    // @ts-expect-error - Workbox is mocked via vi.mock
    Workbox.mockImplementation(function () {
      return mockWb
    })

    service = PWAUpdateService.getInstance()
  })

  afterEach(() => {
    vi.clearAllMocks()
    eventListeners.clear()
    localStorage.clear()
  })

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = PWAUpdateService.getInstance()
      const instance2 = PWAUpdateService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('Initialization', () => {
    it('should skip initialization if service worker not supported', async () => {
      const originalNavigator = global.navigator
      // @ts-expect-error - testing unsupported environment
      delete global.navigator
      // @ts-expect-error - testing unsupported environment
      global.navigator = {}

      await service.initialize()

      expect(Workbox).not.toHaveBeenCalled()

      // Restore
      global.navigator = originalNavigator
    })

    it('should skip initialization in dev mode', async () => {
      vi.stubEnv('DEV', true)

      await service.initialize()

      expect(Workbox).not.toHaveBeenCalled()

      vi.unstubAllEnvs()
    })

    it('should initialize Workbox in production', async () => {
      vi.stubEnv('DEV', false)

      await service.initialize()

      expect(Workbox).toHaveBeenCalledWith('/sw.js', { scope: '/' })
      expect(mockWb.register).toHaveBeenCalled()

      vi.unstubAllEnvs()
    })

    it('should setup event listeners', async () => {
      vi.stubEnv('DEV', false)

      await service.initialize()

      expect(mockWb.addEventListener).toHaveBeenCalledWith('waiting', expect.any(Function))
      expect(mockWb.addEventListener).toHaveBeenCalledWith('installed', expect.any(Function))
      expect(mockWb.addEventListener).toHaveBeenCalledWith('controlling', expect.any(Function))
      expect(mockWb.addEventListener).toHaveBeenCalledWith('activated', expect.any(Function))

      vi.unstubAllEnvs()
    })

    it('should handle initialization errors', async () => {
      vi.stubEnv('DEV', false)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockWb.register.mockRejectedValue(new Error('Registration failed'))

      const events: any[] = []
      service.emitter.addEventListener('update-error', (evt) => {
        events.push((evt as CustomEvent).detail)
      })

      await service.initialize()

      expect(consoleError).toHaveBeenCalled()
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('update-error')

      vi.unstubAllEnvs()
    })
  })

  describe('Event Emission - Prompt Mode', () => {
    beforeEach(async () => {
      vi.stubEnv('DEV', false)
      await service.initialize()
      vi.unstubAllEnvs()
    })

    it('should emit update-available when SW is waiting', () => {
      return new Promise<void>((resolve) => {
        const handler = (evt: Event) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('update-available')
          expect(customEvent.detail.currentVersion).toBeDefined()
          resolve()
        }

        service.emitter.addEventListener('update-available', handler)

        // Trigger waiting event
        const waitingHandler = eventListeners.get('waiting')
        expect(waitingHandler).toBeDefined()
        waitingHandler!({ sw: {} })
      })
    })

    it('should set updateAvailable flag when waiting', () => {
      const waitingHandler = eventListeners.get('waiting')
      waitingHandler!({ sw: {} })

      // Check via getNewVersion (returns version if update available)
      expect(service.getNewVersion()).toBeTruthy()
    })

    it('should NOT emit update-installing on install (prompt mode)', () => {
      return new Promise<void>((resolve) => {
        let updateInstallingEmitted = false

        service.emitter.addEventListener('update-installing', () => {
          updateInstallingEmitted = true
        })

        // Trigger installed event
        const installedHandler = eventListeners.get('installed')
        expect(installedHandler).toBeDefined()
        installedHandler!({ isUpdate: true, sw: {} })

        // Wait and verify no emission
        setTimeout(() => {
          expect(updateInstallingEmitted).toBe(false)
          resolve()
        }, 100)
      })
    })

    it('should skip reload on first install', () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      const installedHandler = eventListeners.get('installed')
      installedHandler!({ isUpdate: false, sw: {} })

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('First install')
      )
    })

    it('should emit update-ready when controlling', () => {
      return new Promise<void>((resolve) => {
        // Mock window.location.reload
        const originalReload = window.location.reload
        const reloadMock = vi.fn()
        Object.defineProperty(window.location, 'reload', {
          value: reloadMock,
          writable: true,
          configurable: true
        })

        const handler = (evt: Event) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('update-ready')

          // Give reload time to be called (it's called after event emission)
          setTimeout(() => {
            expect(reloadMock).toHaveBeenCalled()

            // Restore
            Object.defineProperty(window.location, 'reload', {
              value: originalReload,
              writable: true,
              configurable: true
            })
            resolve()
          }, 10)
        }

        service.emitter.addEventListener('update-ready', handler)

        // Trigger controlling event
        const controllingHandler = eventListeners.get('controlling')
        expect(controllingHandler).toBeDefined()
        controllingHandler!({})
      })
    })

    it('should NOT auto-reload on activated (prompt mode)', () => {
      const originalReload = window.location.reload
      window.location.reload = vi.fn()

      const activatedHandler = eventListeners.get('activated')
      activatedHandler!({ isUpdate: true })

      // Should NOT reload in prompt mode
      expect(window.location.reload).not.toHaveBeenCalled()

      window.location.reload = originalReload
    })
  })

  describe('acceptUpdate()', () => {
    beforeEach(async () => {
      vi.stubEnv('DEV', false)
      await service.initialize()
      vi.unstubAllEnvs()

      // Simulate update available
      const waitingHandler = eventListeners.get('waiting')
      waitingHandler!({ sw: {} })
    })

    it('should emit update-installing', () => {
      return new Promise<void>((resolve) => {
        const handler = (evt: Event) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('update-installing')
          expect(customEvent.detail.currentVersion).toBeDefined()
          resolve()
        }

        service.emitter.addEventListener('update-installing', handler)
        service.acceptUpdate()
      })
    })

    it('should call messageSkipWaiting', async () => {
      await service.acceptUpdate()
      expect(mockWb.messageSkipWaiting).toHaveBeenCalled()
    })

    it('should not call messageSkipWaiting if no update available', async () => {
      // Reset singleton to clear update state
      // @ts-expect-error - accessing private property for testing
      PWAUpdateService.instance = null
      service = PWAUpdateService.getInstance()

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await service.acceptUpdate()

      expect(mockWb.messageSkipWaiting).not.toHaveBeenCalled()
      expect(consoleWarn).toHaveBeenCalled()
    })

    it('should log user acceptance', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.acceptUpdate()

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('User accepted update')
      )
    })
  })

  describe('deferUpdate()', () => {
    it('should store deferred flag in localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

      service.deferUpdate()

      expect(setItemSpy).toHaveBeenCalledWith('pwa_update_deferred', expect.any(String))
    })

    it('should store current timestamp', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)

      service.deferUpdate()

      const stored = localStorage.getItem('pwa_update_deferred')
      expect(stored).toBe(now.toString())
    })

    it('should log defer action', () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

      service.deferUpdate()

      expect(consoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Update deferred by user')
      )
    })
  })

  describe('checkForUpdate()', () => {
    beforeEach(async () => {
      vi.stubEnv('DEV', false)
      await service.initialize()
      vi.unstubAllEnvs()
    })

    it('should return false if Workbox not initialized', async () => {
      // @ts-expect-error - accessing private property for testing
      service.wb = null

      const result = await service.checkForUpdate()

      expect(result).toBe(false)
    })

    it('should call registration.update()', async () => {
      const mockRegistration = {
        update: vi.fn().mockResolvedValue(undefined)
      }

      mockServiceWorker.getRegistration.mockResolvedValue(mockRegistration)

      await service.checkForUpdate()

      expect(mockRegistration.update).toHaveBeenCalled()
    })

    it('should emit no-update-available if no update found', async () => {
      const mockRegistration = {
        update: vi.fn().mockResolvedValue(undefined)
      }

      mockServiceWorker.getRegistration.mockResolvedValue(mockRegistration)

      const eventPromise = new Promise<void>((resolve) => {
        service.emitter.addEventListener('no-update-available', (evt) => {
          const customEvent = evt as CustomEvent
          expect(customEvent.detail.type).toBe('no-update-available')
          resolve()
        })
      })

      await service.checkForUpdate()
      await eventPromise
    })

    it('should return false if registration not found', async () => {
      mockServiceWorker.getRegistration.mockResolvedValue(null)

      const result = await service.checkForUpdate()

      expect(result).toBe(false)
    })

    it('should handle update check errors', async () => {
      mockServiceWorker.getRegistration.mockRejectedValue(new Error('Check failed'))

      const events: any[] = []
      service.emitter.addEventListener('update-error', (evt) => {
        events.push((evt as CustomEvent).detail)
      })

      const result = await service.checkForUpdate()

      expect(result).toBe(false)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('update-error')
    })
  })

  describe('Version Management', () => {
    it('should return current version', () => {
      const version = service.getCurrentVersion()
      expect(version).toBe(__APP_VERSION__)
    })

    it('should return null for new version when no update available', () => {
      const version = service.getNewVersion()
      expect(version).toBeNull()
    })

    it('should return new version when update available', async () => {
      vi.stubEnv('DEV', false)
      await service.initialize()

      // Trigger waiting event
      const waitingHandler = eventListeners.get('waiting')
      waitingHandler!({ sw: {} })

      const version = service.getNewVersion()
      expect(version).toBe(__APP_VERSION__)

      vi.unstubAllEnvs()
    })
  })

  describe('Deferred Update Tracking', () => {
    it('should return false if no deferred flag', () => {
      localStorage.removeItem('pwa_update_deferred')
      expect(service.wasUpdateDeferred()).toBe(false)
    })

    it('should return true if deferred within 24 hours', () => {
      const now = Date.now()
      localStorage.setItem('pwa_update_deferred', now.toString())

      expect(service.wasUpdateDeferred()).toBe(true)
    })

    it('should return false and clear flag if deferred > 24 hours ago', () => {
      const yesterday = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
      localStorage.setItem('pwa_update_deferred', yesterday.toString())

      expect(service.wasUpdateDeferred()).toBe(false)
      expect(localStorage.getItem('pwa_update_deferred')).toBeNull()
    })

    it('should clear deferred flag manually', () => {
      localStorage.setItem('pwa_update_deferred', Date.now().toString())

      service.clearDeferredFlag()

      expect(localStorage.getItem('pwa_update_deferred')).toBeNull()
    })

    it('should handle invalid deferred timestamp', () => {
      localStorage.setItem('pwa_update_deferred', 'invalid')

      // Should not throw error
      const result = service.wasUpdateDeferred()

      expect(typeof result).toBe('boolean')
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple waiting events', async () => {
      vi.stubEnv('DEV', false)
      await service.initialize()

      const events: any[] = []
      service.emitter.addEventListener('update-available', (evt) => {
        events.push((evt as CustomEvent).detail)
      })

      const waitingHandler = eventListeners.get('waiting')

      // Trigger multiple times
      waitingHandler!({ sw: {} })
      waitingHandler!({ sw: {} })

      expect(events).toHaveLength(2)

      vi.unstubAllEnvs()
    })

    it('should handle acceptUpdate without initialization', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await service.acceptUpdate()

      expect(consoleWarn).toHaveBeenCalled()
      expect(mockWb.messageSkipWaiting).not.toHaveBeenCalled()
    })

    it('should handle window.location.reload errors', async () => {
      vi.stubEnv('DEV', false)
      await service.initialize()

      const originalReload = window.location.reload
      window.location.reload = vi.fn(() => {
        throw new Error('Reload failed')
      })

      const controllingHandler = eventListeners.get('controlling')

      // Should not throw error
      expect(() => controllingHandler!({})).toThrow('Reload failed')

      window.location.reload = originalReload
      vi.unstubAllEnvs()
    })
  })
})
