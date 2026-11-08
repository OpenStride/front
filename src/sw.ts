/// <reference lib="webworker" />
/**
 * OpenStride Service Worker
 * Workbox (PWA caching) and the update handshake. It imports nothing from
 * plugins: push notifications, when they come back, will be a core push
 * handler fed by a plugin (see docs/plans/GARMIN_PUSH.md)
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { logger } from '@/utils/logger'

declare const self: ServiceWorkerGlobalScope

// Version is injected by Vite define, fallback for dev mode
declare const __APP_VERSION__: string | undefined
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

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
// 2. Service Worker Lifecycle
// ========================================

self.addEventListener('install', _event => {
  logger.debug('[Service Worker] Installing version', APP_VERSION)
  // Prompt mode: wait for user consent via messageSkipWaiting()
  // skipWaiting() will be called via message handler when user accepts update
})

self.addEventListener('activate', event => {
  logger.debug('[Service Worker] Activating version', APP_VERSION)
  event.waitUntil(self.clients.claim()) // Take control immediately
})

// ========================================
// 3. Message Handling (from app)
// ========================================

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

logger.debug('[Service Worker] OpenStride SW loaded successfully')
