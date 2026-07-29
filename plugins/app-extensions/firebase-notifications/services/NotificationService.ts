import { getToken, type Messaging } from 'firebase/messaging'
import { getFirebaseMessaging, isFirebaseConfigured } from '../lib/firebase'
import type { IStorageService, ProviderImportEvent } from '@/types/plugin-context'

export interface NotificationState {
  enabled: boolean
  token: string | null
  tokenTimestamp: number | null
  permissionStatus: NotificationPermission
}

export class NotificationService {
  private static instance: NotificationService | null = null
  private messaging: Messaging | null = null
  private storage: IStorageService | null = null
  /** Set while subscribed; calling it unsubscribes. */
  private unsubscribeImports: (() => void) | null = null

  private constructor() {
    /* singleton */
  }

  public static getInstance(): NotificationService | null {
    // Only create instance if Firebase is configured
    if (!isFirebaseConfigured()) {
      console.warn('[Firebase Notifications] Plugin disabled: Firebase not configured')
      return null
    }

    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  /**
   * Initialize the notification service
   */
  public async initialize(storageService?: IStorageService): Promise<boolean> {
    try {
      this.messaging = getFirebaseMessaging()
      if (!this.messaging) {
        console.warn('[Firebase Notifications] Firebase messaging not available')
        return false
      }

      if (storageService) {
        this.storage = storageService
      } else {
        // Fallback: get storage from PluginContext
        const { getPluginContext } = await import('@/services/PluginContextFactory')
        const ctx = await getPluginContext()
        this.storage = ctx.storage
      }

      // Check if notifications are enabled
      const isEnabled = await this.isEnabled()
      if (isEnabled) {
        await this.startListening()
      }

      return true
    } catch (error) {
      console.error('[Firebase Notifications] Initialization failed:', error)
      return false
    }
  }

  /**
   * Check if notifications are enabled
   */
  public async isEnabled(): Promise<boolean> {
    if (!this.storage) return false
    const enabled = await this.storage.getData('firebase_notifications_enabled')
    return enabled === true
  }

  /**
   * Enable notifications and request permission
   */
  public async enable(): Promise<{ success: boolean; error?: string }> {
    if (!this.messaging || !this.storage) {
      return { success: false, error: 'Service not initialized' }
    }

    try {
      // Check browser support
      if (!('Notification' in window)) {
        return { success: false, error: 'Notifications not supported by browser' }
      }

      // Request permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        return { success: false, error: 'Permission denied' }
      }

      // Get FCM token
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
      if (!vapidKey) {
        return { success: false, error: 'VAPID key not configured' }
      }

      const token = await getToken(this.messaging, { vapidKey })
      if (!token) {
        return { success: false, error: 'Failed to get FCM token' }
      }

      // Store token and enable state
      await this.storage.saveData('fcm_token', token)
      await this.storage.saveData('fcm_token_timestamp', Date.now())
      await this.storage.saveData('firebase_notifications_enabled', true)

      console.log('[Firebase Notifications] Token obtained:', token)

      // Start listening to events
      await this.startListening()

      return { success: true }
    } catch (error) {
      console.error('[Firebase Notifications] Enable failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Disable notifications
   */
  public async disable(): Promise<void> {
    if (!this.storage) return

    await this.storage.saveData('firebase_notifications_enabled', false)
    this.stopListening()
    console.log('[Firebase Notifications] Disabled')
  }

  /**
   * Start listening to DataProvider events
   */
  private async startListening(): Promise<void> {
    if (this.unsubscribeImports) return

    // Through the context, like every other core service a plugin touches.
    const { getPluginContext } = await import('@/services/PluginContextFactory')
    const ctx = await getPluginContext()
    this.unsubscribeImports = ctx.providers.onActivitiesImported(this.handleNewActivities)
  }

  /**
   * Stop listening to events
   */
  private stopListening(): void {
    this.unsubscribeImports?.()
    this.unsubscribeImports = null
  }

  /**
   * Handle new activities event
   */
  private handleNewActivities = (event: ProviderImportEvent): void => {
    // The payload used to be hand-typed here as `{ providerId, count, activities }`;
    // the event never carried a count or an activity list, so both read as
    // undefined. Typing it in the contract is what makes that impossible.
    console.log('[Firebase Notifications] Import finished:', event.providerLabel)

    // The notification itself comes from the backend pushing to the FCM token;
    // this hook exists so the plugin knows when to expect one.
  }

  /**
   * Get current notification state
   */
  public async getState(): Promise<NotificationState> {
    if (!this.storage) {
      return {
        enabled: false,
        token: null,
        tokenTimestamp: null,
        permissionStatus: 'default'
      }
    }

    const enabled = await this.isEnabled()
    const token = (await this.storage.getData('fcm_token')) as string | null
    const tokenTimestamp = (await this.storage.getData('fcm_token_timestamp')) as number | null
    const permissionStatus = 'Notification' in window ? Notification.permission : 'default'

    return {
      enabled,
      token,
      tokenTimestamp,
      permissionStatus
    }
  }

  /**
   * Refresh FCM token if older than 30 days
   */
  public async refreshTokenIfNeeded(): Promise<void> {
    if (!this.messaging || !this.storage) return

    const tokenTimestamp = (await this.storage.getData('fcm_token_timestamp')) as number | null
    if (!tokenTimestamp) return

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    const now = Date.now()

    if (now - tokenTimestamp > thirtyDaysMs) {
      console.log('[Firebase Notifications] Token is older than 30 days, refreshing...')
      const result = await this.enable() // Re-enable will get a new token
      if (result.success) {
        console.log('[Firebase Notifications] Token refreshed successfully')
      }
    }
  }
}
