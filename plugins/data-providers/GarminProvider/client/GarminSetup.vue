<template>
  <div>
    <DefaultProviderSetupView
      provider-name="Garmin"
      :is-connected="isConnected"
      :is-loading="isWaitingForOAuth"
      @connect="connectToGarmin"
      @disconnect="disconnectGarmin"
    />

    <!-- Fallback for popup blocked -->
    <div v-if="showFallbackRedirect" class="fallback-section">
      <p class="fallback-text">
        <i class="fas fa-info-circle" aria-hidden="true"></i>
        Popup was blocked. Allow popups or use the alternative method.
      </p>
      <button @click="connectWithRedirect" class="fallback-button">
        <i class="fas fa-external-link-alt" aria-hidden="true"></i>
        Connect via redirect
      </button>
      <p class="fallback-warning">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        On Samsung Android, the redirect may open a different browser.
      </p>
    </div>

    <!-- Status section (only when connected) -->
    <div v-if="isConnected" class="mt-6 text-center" data-test="garmin-status-section">
      <!-- Syncing state -->
      <div v-if="syncState.status === 'syncing'" class="text-gray-600">
        <i class="fas fa-sync-alt fa-spin mr-2" aria-hidden="true"></i>
        <span v-if="syncProgress">
          Import {{ syncProgress.month }} ({{ syncProgress.completed + 1 }}/{{
            syncProgress.total
          }})
        </span>
        <span v-else>Importing...</span>
      </div>

      <!-- Error state -->
      <div v-else-if="syncState.status === 'error'" class="text-red-600">
        <i class="fas fa-exclamation-triangle mr-2" aria-hidden="true"></i>
        <span>Error: {{ syncState.lastError }}</span>
        <button @click="retryImport" class="ml-4 text-sm text-blue-600 hover:underline">
          Retry
        </button>
      </div>

      <!-- Idle state (normal) -->
      <div v-else class="space-y-2">
        <p class="text-gray-700">
          <i class="fas fa-check-circle text-green-600 mr-2" aria-hidden="true"></i>
          <span v-if="syncState.initialImportDone">
            Synced
            <span v-if="syncState.lastSyncDate" class="text-gray-500">
              · {{ formatLastSync(syncState.lastSyncDate) }}
            </span>
          </span>
          <span v-else> Connected · Initial import pending </span>
        </p>

        <!-- Manual refresh button (polls Firestore for push data) -->
        <button
          @click="manualRefresh"
          :disabled="isRefreshing"
          class="text-sm text-gray-500 hover:text-gray-700 transition"
          data-test="manual-refresh-button"
        >
          <i
            class="fas fa-sync-alt mr-1"
            :class="{ 'fa-spin': isRefreshing }"
            aria-hidden="true"
          ></i>
          Refresh
        </button>

        <!-- Fetch last 10 days via backfill -->
        <button
          @click="fetchLast10Days"
          :disabled="isFetchingRecent"
          class="text-sm text-gray-500 hover:text-gray-700 transition ml-4"
        >
          <i
            class="fas fa-download mr-1"
            :class="{ 'fa-spin': isFetchingRecent }"
            aria-hidden="true"
          ></i>
          Fetch last 10 days
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import DefaultProviderSetupView from '@/components/providers/DefaultProviderSetup.vue'
import { usePluginContext } from '@/composables/usePluginContext'
import {
  getTokens,
  deleteTokens,
  deletePluginData,
  getSyncState,
  updateSyncState,
  type GarminSyncState
} from './storage'
import {
  getGarminSyncManager,
  syncEmitter,
  type SyncCompleteEvent,
  type SyncProgressEvent
} from './GarminSyncManager'
import { generateCodeVerifier, generateCodeChallenge, exchangeCodeForTokens } from './garminAuth'
import pluginEnv from './env'

const isConnected = ref(false)
const isRefreshing = ref(false)
const isFetchingRecent = ref(false)
const isWaitingForOAuth = ref(false)
const showFallbackRedirect = ref(false)
// Plain variable — NOT a ref. Storing a cross-origin Window in a Vue ref
// causes SecurityError because Vue's reactivity probes __v_isShallow on it.
let oauthPopup: Window | null = null
let popupPollInterval: ReturnType<typeof setInterval> | null = null
const syncProgress = ref<{ month: string; completed: number; total: number } | null>(null)
const syncState = reactive<GarminSyncState>({
  status: 'idle',
  initialImportDone: false,
  backfillAskedMonths: [],
  backfillSyncedMonths: [],
  lastSyncDate: null,
  lastError: null
})

const ctx = usePluginContext()
const { notifications, plugins } = ctx

let oauthChannel: BroadcastChannel | null = null

// ============================================================================
// OAuth 2.0 PKCE Flow (Popup-based)
// ============================================================================

async function connectToGarmin() {
  // Generate PKCE verifier + challenge
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  sessionStorage.setItem('garmin_pkce_verifier', codeVerifier)

  // Generate CSRF state token
  const state = crypto.randomUUID()
  sessionStorage.setItem('garmin_oauth_state', state)

  const redirectUri = `${window.location.origin}/oauth/garmin/callback`
  const authUrl =
    `${pluginEnv.garminAuthUrl}?client_id=${pluginEnv.clientId}` +
    `&response_type=code` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent('HISTORICAL_DATA_EXPORT ACTIVITY_EXPORT')}` +
    `&state=${state}`

  // Open centered popup
  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  oauthPopup = window.open(
    authUrl,
    'GarminOAuth',
    `width=${width},height=${height},left=${left},top=${top},popup=yes`
  )

  // Check if popup was blocked
  if (!oauthPopup || oauthPopup.closed) {
    handlePopupBlocked()
    return
  }

  isWaitingForOAuth.value = true
  showFallbackRedirect.value = false

  // Listen via postMessage (works if opener ref survives cross-origin navigation)
  window.addEventListener('message', handleOAuthMessage)

  // Listen via BroadcastChannel (fallback when opener ref is nullified by COOP)
  oauthChannel = new BroadcastChannel('garmin-oauth')
  oauthChannel.onmessage = (event: MessageEvent) => {
    handleOAuthMessage({ ...event, origin: window.location.origin } as MessageEvent)
  }

  // Poll to detect if popup closes without completing OAuth
  popupPollInterval = setInterval(() => {
    if (oauthPopup?.closed) {
      if (popupPollInterval) clearInterval(popupPollInterval)
      popupPollInterval = null
      if (isWaitingForOAuth.value) {
        handleOAuthCancelled()
      }
    }
  }, 500)
}

async function handleOAuthMessage(event: MessageEvent) {
  // Security: only accept messages from same origin
  if (event.origin !== window.location.origin) return
  if (event.data?.type !== 'garmin-oauth-callback') return

  // Cleanup
  window.removeEventListener('message', handleOAuthMessage)
  cleanupOAuthChannel()
  isWaitingForOAuth.value = false
  oauthPopup?.close()

  // Validate state (CSRF protection)
  const expectedState = sessionStorage.getItem('garmin_oauth_state')
  if (event.data.state !== expectedState) {
    notifications.notify('OAuth security error (state mismatch)', { type: 'error' })
    return
  }
  sessionStorage.removeItem('garmin_oauth_state')

  // Handle error from OAuth provider
  if (event.data.error) {
    notifications.notify(`Garmin: ${event.data.error}`, { type: 'error' })
    return
  }

  // Exchange authorization code for tokens via Firebase proxy
  const { code } = event.data
  if (code) {
    try {
      const codeVerifier = sessionStorage.getItem('garmin_pkce_verifier')
      if (!codeVerifier) {
        notifications.notify('Error: PKCE verifier missing', { type: 'error' })
        return
      }
      sessionStorage.removeItem('garmin_pkce_verifier')

      const redirectUri = `${window.location.origin}/oauth/garmin/callback`
      await exchangeCodeForTokens(code, codeVerifier, redirectUri)
      isConnected.value = true

      await plugins.enablePlugin('garmin')

      const syncManager = getGarminSyncManager()
      await syncManager.startInitialImportAsync()

      notifications.notify('Garmin connected! Importing...', { type: 'info' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Token exchange error'
      notifications.notify(`Garmin: ${message}`, { type: 'error' })
    }
  }
}

function handlePopupBlocked() {
  isWaitingForOAuth.value = false
  showFallbackRedirect.value = true
  notifications.notify('Popup blocked. Allow popups or use the fallback below.', {
    type: 'warning'
  })
}

function handleOAuthCancelled() {
  window.removeEventListener('message', handleOAuthMessage)
  cleanupOAuthChannel()
  isWaitingForOAuth.value = false
  sessionStorage.removeItem('garmin_oauth_state')
  sessionStorage.removeItem('garmin_pkce_verifier')
}

function cleanupOAuthChannel() {
  if (oauthChannel) {
    oauthChannel.close()
    oauthChannel = null
  }
}

async function connectWithRedirect() {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  sessionStorage.setItem('garmin_pkce_verifier', codeVerifier)

  const state = crypto.randomUUID()
  sessionStorage.setItem('garmin_oauth_state', state)

  const redirectUri = `${window.location.origin}/oauth/garmin/callback`
  window.location.href =
    `${pluginEnv.garminAuthUrl}?client_id=${pluginEnv.clientId}` +
    `&response_type=code` +
    `&code_challenge=${codeChallenge}` +
    `&code_challenge_method=S256` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent('HISTORICAL_DATA_EXPORT ACTIVITY_EXPORT')}` +
    `&state=${state}`
}

async function disconnectGarmin() {
  // Purge all Garmin activities from local database
  const allActivities = await ctx.activity.getAllActivities()
  const garminActivities = allActivities.filter((a: { id: string }) => a.id.startsWith('garmin_'))
  for (const activity of garminActivities) {
    await ctx.activity.deleteActivity(activity.id)
  }
  if (garminActivities.length > 0) {
    console.log(`[GarminSetup] Purged ${garminActivities.length} Garmin activities`)
  }

  // Clear plugin data
  await deleteTokens()
  await deletePluginData('userId')
  await updateSyncState({
    status: 'idle',
    initialImportDone: false,
    backfillAskedMonths: [],
    backfillSyncedMonths: [],
    lastSyncDate: null,
    lastError: null
  })
  isConnected.value = false
  Object.assign(syncState, await getSyncState())

  notifications.notify(`Garmin disconnected. ${garminActivities.length} activities removed.`, {
    type: 'info'
  })
}

// ============================================================================
// Sync Actions
// ============================================================================

async function retryImport() {
  // Reset error state but keep backfill progress (don't re-request already asked backfills)
  await updateSyncState({ status: 'idle', lastError: null, initialImportDone: false })
  Object.assign(syncState, await getSyncState())

  const syncManager = getGarminSyncManager()
  await syncManager.startInitialImportAsync()
}

async function manualRefresh() {
  isRefreshing.value = true
  try {
    const syncManager = getGarminSyncManager()
    const count = await syncManager.dailyRefresh()
    notifications.notify(`Garmin: ${count} activities synced`, { type: 'success' })
  } catch (err: unknown) {
    notifications.notify(`Garmin: ${err instanceof Error ? err.message : 'Error'}`, {
      type: 'error'
    })
  } finally {
    isRefreshing.value = false
    Object.assign(syncState, await getSyncState())
  }
}

async function fetchLast10Days() {
  isFetchingRecent.value = true
  try {
    const syncManager = getGarminSyncManager()
    const count = await syncManager.fetchRecentDays(10)
    notifications.notify(`Garmin: ${count} activities fetched`, { type: 'success' })
  } catch (err: unknown) {
    notifications.notify(`Garmin: ${err instanceof Error ? err.message : 'Error'}`, {
      type: 'error'
    })
  } finally {
    isFetchingRecent.value = false
    Object.assign(syncState, await getSyncState())
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleSyncComplete(event: Event) {
  const { success, count, error } = (event as CustomEvent<SyncCompleteEvent>).detail

  if (success) {
    notifications.notify(`Garmin: ${count} activities imported`, { type: 'success' })
  } else {
    notifications.notify(`Garmin: ${error || 'Import error'}`, { type: 'error' })
  }

  // Clear progress and refresh state
  syncProgress.value = null
  getSyncState().then(state => Object.assign(syncState, state))
}

function handleSyncProgress(event: Event) {
  const detail = (event as CustomEvent<SyncProgressEvent>).detail

  if (detail.type === 'started') {
    // Update state to show syncing
    syncState.status = 'syncing'
    syncProgress.value = null
  } else if (detail.type === 'progress') {
    syncProgress.value = {
      month: detail.month || '',
      completed: detail.completed || 0,
      total: detail.total || 0
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatLastSync(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'a few seconds ago'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  // Listen for sync events
  syncEmitter.addEventListener('sync-complete', handleSyncComplete)
  syncEmitter.addEventListener('sync-progress', handleSyncProgress)

  // Check URL params for OAuth 2.0 redirect callback (fallback flow)
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('oauth_error')

  // Handle OAuth error redirected from callback page
  if (oauthError) {
    const message =
      oauthError === 'access_denied'
        ? 'Garmin access denied. Please try again.'
        : `Garmin OAuth error: ${oauthError}`
    notifications.notify(message, { type: 'error' })
    window.history.replaceState({}, '', window.location.pathname)
  } else if (code && state) {
    const expectedState = sessionStorage.getItem('garmin_oauth_state')
    if (state !== expectedState) {
      notifications.notify('OAuth security error (state mismatch)', { type: 'error' })
      sessionStorage.removeItem('garmin_oauth_state')
      sessionStorage.removeItem('garmin_pkce_verifier')
    } else {
      sessionStorage.removeItem('garmin_oauth_state')

      try {
        const codeVerifier = sessionStorage.getItem('garmin_pkce_verifier')
        if (!codeVerifier) throw new Error('PKCE verifier missing')
        sessionStorage.removeItem('garmin_pkce_verifier')

        const redirectUri = window.location.href.split('?')[0]
        await exchangeCodeForTokens(code, codeVerifier, redirectUri)
        isConnected.value = true

        await plugins.enablePlugin('garmin')

        const syncManager = getGarminSyncManager()
        await syncManager.startInitialImportAsync()

        notifications.notify('Garmin connected! Importing...', { type: 'info' })
      } catch (err: unknown) {
        notifications.notify(`Garmin: ${err instanceof Error ? err.message : 'Error'}`, {
          type: 'error'
        })
      }
    }

    window.history.replaceState({}, '', window.location.pathname)
  } else {
    // Check existing tokens
    const tokens = await getTokens()
    if (tokens) {
      isConnected.value = true
      await plugins.enablePlugin('garmin')

      // Resume the initial import if it never finished (e.g. tab was closed
      // mid-import). startInitialImportAsync() is idempotent: it no-ops when an
      // import is already running or already complete, and picks up from the
      // saved per-month state otherwise.
      const currentState = await getSyncState()
      if (!currentState.initialImportDone) {
        const syncManager = getGarminSyncManager()
        void syncManager.startInitialImportAsync()
      }
    }
  }

  // Load current sync state — reset stale 'syncing' status
  const loadedState = await getSyncState()
  if (loadedState.status === 'syncing') {
    loadedState.status = 'idle'
    await updateSyncState({ status: 'idle' })
  }
  Object.assign(syncState, loadedState)
})

onUnmounted(() => {
  if (popupPollInterval) clearInterval(popupPollInterval)
  window.removeEventListener('message', handleOAuthMessage)
  cleanupOAuthChannel()
  syncEmitter.removeEventListener('sync-complete', handleSyncComplete)
  syncEmitter.removeEventListener('sync-progress', handleSyncProgress)
})
</script>

<style scoped>
.fallback-section {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--color-gray-50, #f9fafb);
  border-radius: 8px;
  text-align: center;
}

.fallback-text {
  color: var(--color-gray-600, #4b5563);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.fallback-text i {
  margin-right: 0.5rem;
  color: var(--color-blue-500, #3b82f6);
}

.fallback-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--color-green-500, #88aa00);
  color: var(--color-white);
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.fallback-button:hover {
  background: var(--color-green-600, #6d8a00);
}

.fallback-warning {
  margin-top: 0.75rem;
  color: var(--color-yellow-600, #d97706);
  font-size: 0.75rem;
}

.fallback-warning i {
  margin-right: 0.25rem;
}
</style>
