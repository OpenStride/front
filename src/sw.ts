/// <reference lib="webworker" />
/**
 * OpenStride Service Worker
 * Combines Workbox (PWA caching) with Firebase Messaging (push notifications)
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import {
  initializeFirebaseMessaging,
  setupBackgroundMessageHandler,
  setupNotificationClickHandler
} from '../plugins/app-extensions/firebase-notifications/services/sw-messaging'

declare const self: ServiceWorkerGlobalScope

// ========================================
// 1. Workbox Setup (PWA Caching)
// ========================================

cleanupOutdatedCaches()

// Precache all assets from the build manifest
precacheAndRoute(self.__WB_MANIFEST)

// Cache images with CacheFirst strategy
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      })
    ]
  })
)

// Cache API responses with StaleWhileRevalidate
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new StaleWhileRevalidate({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 5 * 60 // 5 minutes
      })
    ]
  })
)

// ========================================
// 2. Firebase Messaging Setup
// ========================================

// Initialize Firebase Messaging if configured
const messaging = initializeFirebaseMessaging()

if (messaging) {
  console.log('[Service Worker] Firebase Messaging enabled')

  // Setup background message handler
  setupBackgroundMessageHandler(messaging)

  // Setup notification click handler
  setupNotificationClickHandler()
} else {
  console.log('[Service Worker] Firebase Messaging not configured, skipping')
}

// ========================================
// 3. Service Worker Lifecycle
// ========================================

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing version', __APP_VERSION__)
  // AutoUpdate mode: skip waiting immediately
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating version', __APP_VERSION__)
  event.waitUntil(self.clients.claim()) // Take control immediately
})

// ========================================
// 4. Message Handling (from app)
// ========================================

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

console.log('[Service Worker] OpenStride SW loaded successfully')
