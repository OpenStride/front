import { getToken, type Messaging } from 'firebase/messaging'
import { getFirebaseMessaging, isFirebaseConfigured } from '../lib/firebase'
import { DataProviderService } from '@/services/DataProviderService'
import type { IStorageService } from '@/types/plugin-context'

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
  // TODO: migrate to PluginContext when event bus is exposed
  private dataProviderService: DataProviderService
  private isListening = false

  private constructor() {
    this.dataProviderService = DataProviderService.getInstance()
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
    if (this.isListening) return

    // Listen to provider refresh events
    // Note: DataProviderService needs to have an emitter
    const svc = this.dataProviderService as DataProviderService & { emitter?: EventTarget }
    if (svc.emitter) {
      svc.emitter.addEventListener('provider-activities-imported', this.handleNewActivities)
      this.isListening = true
      console.log('[Firebase Notifications] Started listening to data provider events')
    } else {
      console.warn('[Firebase Notifications] DataProviderService does not emit events yet')
    }
  }

  /**
   * Stop listening to events
   */
  private stopListening(): void {
    if (!this.isListening) return

    const svc = this.dataProviderService as DataProviderService & { emitter?: EventTarget }
    if (svc.emitter) {
      svc.emitter.removeEventListener('provider-activities-imported', this.handleNewActivities)
    }
    this.isListening = false
    console.log('[Firebase Notifications] Stopped listening')
  }

  /**
   * Handle new activities event
   */
  private handleNewActivities = (event: Event): void => {
    const customEvent = event as CustomEvent<{
      providerId: string
      count: number
      activities: unknown[]
    }>

    console.log('[Firebase Notifications] New activities detected:', customEvent.detail)

    // In a real implementation, this would trigger a notification via the Service Worker
    // For now, we just log it. The actual notification will be triggered by the backend
    // sending a push message to the FCM token.
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
