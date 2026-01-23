/**
 * PWA Update Service
 *
 * Manages PWA lifecycle, version detection, and update flow.
 * Uses Workbox Window for proper Service Worker lifecycle management.
 *
 * Architecture:
 * - Event-driven: emits events for UI components to listen to
 * - No direct ToastService calls (UI layer responsibility)
 * - Singleton pattern for global access
 */

import { Workbox } from 'workbox-window'

export interface PWAUpdateEvent {
  type:
    | 'update-available' // New version detected (SW waiting)
    | 'update-installing' // User accepted, installing
    | 'update-ready' // Installed, ready for reload
    | 'update-activated' // After reload, new version active
    | 'no-update-available' // Check complete, no update
    | 'update-error' // Update failed
  currentVersion?: string
  newVersion?: string
  error?: string
}

export class PWAUpdateService {
  private static instance: PWAUpdateService | null = null
  private wb: Workbox | null = null
  private updateAvailable = false
  private newWorker: ServiceWorker | null = null
  public emitter = new EventTarget()

  private constructor() {}

  public static getInstance(): PWAUpdateService {
    if (!PWAUpdateService.instance) {
      PWAUpdateService.instance = new PWAUpdateService()
    }
    return PWAUpdateService.instance
  }

  /**
   * Initialize Workbox and setup listeners
   * Should be called once during app bootstrap
   */
  public async initialize(): Promise<void> {
    // Only in production and if service worker is supported
    if (!('serviceWorker' in navigator)) {
      console.log('[PWAUpdateService] Service Worker not supported')
      return
    }

    if (import.meta.env.DEV) {
      console.log('[PWAUpdateService] Dev mode - update detection disabled')
      return
    }

    try {
      this.wb = new Workbox('/sw.js', {
        scope: '/'
      })

      // New service worker waiting to activate
      this.wb.addEventListener('waiting', (event) => {
        console.log('[PWAUpdateService] New service worker waiting')
        this.newWorker = event.sw || null
        this.updateAvailable = true

        // Emit update-available event
        this.emitter.dispatchEvent(
          new CustomEvent<PWAUpdateEvent>('update-available', {
            detail: {
              type: 'update-available',
              currentVersion: this.getCurrentVersion(),
              newVersion: this.getCurrentVersion() // TODO: fetch from SW if possible
            }
          })
        )
      })

      // New service worker has taken control
      this.wb.addEventListener('controlling', () => {
        console.log('[PWAUpdateService] New service worker controlling')
        this.emitter.dispatchEvent(
          new CustomEvent<PWAUpdateEvent>('update-ready', {
            detail: { type: 'update-ready' }
          })
        )

        // Reload to activate new version
        window.location.reload()
      })

      // Service worker activated (after reload)
      this.wb.addEventListener('activated', (event) => {
        console.log('[PWAUpdateService] Service worker activated')
        if (!event.isUpdate) {
          console.log('[PWAUpdateService] First install')
        }
      })

      // Register the service worker
      await this.wb.register()
      console.log('[PWAUpdateService] Initialized successfully')
    } catch (error) {
      console.error('[PWAUpdateService] Initialization error:', error)
      this.emitter.dispatchEvent(
        new CustomEvent<PWAUpdateEvent>('update-error', {
          detail: {
            type: 'update-error',
            error: String(error)
          }
        })
      )
    }
  }

  /**
   * Check for updates manually
   * Can be called by user action (e.g., "Check for updates" button)
   */
  public async checkForUpdate(): Promise<boolean> {
    if (!this.wb) {
      console.log('[PWAUpdateService] Workbox not initialized')
      return false
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        console.log('[PWAUpdateService] No service worker registration found')
        return false
      }

      await registration.update()
      console.log('[PWAUpdateService] Update check complete')

      if (!this.updateAvailable) {
        this.emitter.dispatchEvent(
          new CustomEvent<PWAUpdateEvent>('no-update-available', {
            detail: { type: 'no-update-available' }
          })
        )
      }

      return this.updateAvailable
    } catch (error) {
      console.error('[PWAUpdateService] Update check error:', error)
      this.emitter.dispatchEvent(
        new CustomEvent<PWAUpdateEvent>('update-error', {
          detail: {
            type: 'update-error',
            error: String(error)
          }
        })
      )
      return false
    }
  }

  /**
   * Accept update and reload
   * Sends SKIP_WAITING message to waiting service worker
   */
  public async acceptUpdate(): Promise<void> {
    if (!this.updateAvailable || !this.wb) {
      console.warn('[PWAUpdateService] No update available to accept')
      return
    }

    console.log('[PWAUpdateService] Accepting update...')

    this.emitter.dispatchEvent(
      new CustomEvent<PWAUpdateEvent>('update-installing', {
        detail: { type: 'update-installing' }
      })
    )

    // Tell the waiting service worker to activate
    this.wb.messageSkipWaiting()
  }

  /**
   * Defer update (user clicked "Later")
   * Just dismisses the notification, update remains available
   */
  public deferUpdate(): void {
    console.log('[PWAUpdateService] Update deferred by user')
    // Store flag in localStorage to remember user deferred
    localStorage.setItem('pwa_update_deferred', Date.now().toString())
  }

  /**
   * Get current running version
   */
  public getCurrentVersion(): string {
    return __APP_VERSION__
  }

  /**
   * Get new available version (if any)
   * For now returns same as current - could be enhanced to fetch from SW
   */
  public getNewVersion(): string | null {
    return this.updateAvailable ? __APP_VERSION__ : null
  }

  /**
   * Check if user previously deferred an update
   */
  public wasUpdateDeferred(): boolean {
    const deferred = localStorage.getItem('pwa_update_deferred')
    if (!deferred) return false

    // Clear flag after 24 hours
    const deferredTime = parseInt(deferred, 10)
    const now = Date.now()
    const hoursSinceDefer = (now - deferredTime) / (1000 * 60 * 60)

    if (hoursSinceDefer > 24) {
      localStorage.removeItem('pwa_update_deferred')
      return false
    }

    return true
  }

  /**
   * Clear deferred flag
   */
  public clearDeferredFlag(): void {
    localStorage.removeItem('pwa_update_deferred')
  }
}

// Export singleton getter
export function getPWAUpdateService(): PWAUpdateService {
  return PWAUpdateService.getInstance()
}
