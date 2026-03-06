/**
 * Service Worker Firebase Messaging Handler
 * This file is imported by the main service worker to handle push notifications
 */

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage, type Messaging } from 'firebase/messaging/sw'

// Type declaration for Service Worker global scope
declare const self: ServiceWorkerGlobalScope

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

let messagingInstance: Messaging | null = null

/**
 * Initialize Firebase Messaging for Service Worker
 * Returns null if Firebase is not properly configured
 */
export function initializeFirebaseMessaging(): Messaging | null {
  try {
    // Check if Firebase is configured
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
      console.warn('[SW Firebase] Firebase not configured, skipping messaging setup')
      return null
    }

    if (!messagingInstance) {
      const app: FirebaseApp = initializeApp(firebaseConfig)
      messagingInstance = getMessaging(app)
      console.log('[SW Firebase] Messaging initialized')
    }

    return messagingInstance
  } catch (error) {
    console.error('[SW Firebase] Failed to initialize messaging:', error)
    return null
  }
}

/**
 * Setup Firebase background message handler
 */
export function setupBackgroundMessageHandler(messaging: Messaging): void {
  onBackgroundMessage(messaging, payload => {
    console.log('[SW Firebase] Background message received:', payload)

    const notificationTitle = payload.notification?.title || 'OpenStride'
    const notificationOptions = {
      body: payload.notification?.body || 'De nouvelles activités sont disponibles',
      icon: '/logo.svg',
      badge: '/badge.png',
      tag: 'openstride-activity-update',
      data: {
        url: payload.data?.url || '/my-activities',
        timestamp: Date.now()
      },
      requireInteraction: false,
      silent: false
    }

    // Show notification
    self.registration.showNotification(notificationTitle, notificationOptions)
  })
}

/**
 * Handle notification click
 */
export function setupNotificationClickHandler(): void {
  self.addEventListener('notificationclick', event => {
    console.log('[SW Firebase] Notification clicked:', event.notification.tag)

    event.notification.close()

    const urlToOpen = event.notification.data?.url || '/my-activities'

    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return (client as WindowClient).focus().then(focused => {
              // Navigate to the activities page
              return focused.navigate(urlToOpen)
            })
          }
        }
        // If no window is open, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen)
        }
      })
    )
  })
}
