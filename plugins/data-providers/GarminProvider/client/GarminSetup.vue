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
        La fenêtre popup a été bloquée. Vous pouvez autoriser les popups ou utiliser la méthode alternative.
      </p>
      <button @click="connectWithRedirect" class="fallback-button">
        <i class="fas fa-external-link-alt" aria-hidden="true"></i>
        Connexion via redirection
      </button>
      <p class="fallback-warning">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        Sur Samsung Android, la redirection peut ouvrir un autre navigateur.
      </p>
    </div>

    <!-- Status section (only when connected) -->
    <div v-if="isConnected" class="mt-6 text-center" data-test="garmin-status-section">
      <!-- Syncing state -->
      <div v-if="syncState.status === 'syncing'" class="text-gray-600">
        <i class="fas fa-sync-alt fa-spin mr-2" aria-hidden="true"></i>
        <span v-if="syncProgress">
          Import {{ syncProgress.month }} ({{ syncProgress.completed + 1 }}/{{ syncProgress.total }})
        </span>
        <span v-else>Import en cours...</span>
      </div>

      <!-- Error state -->
      <div v-else-if="syncState.status === 'error'" class="text-red-600">
        <i class="fas fa-exclamation-triangle mr-2" aria-hidden="true"></i>
        <span>Erreur: {{ syncState.lastError }}</span>
        <button
          @click="retryImport"
          class="ml-4 text-sm text-blue-600 hover:underline"
        >
          Réessayer
        </button>
      </div>

      <!-- Idle state (normal) -->
      <div v-else class="space-y-2">
        <p class="text-gray-700">
          <i class="fas fa-check-circle text-green-600 mr-2" aria-hidden="true"></i>
          <span v-if="syncState.initialImportDone">
            Synchronisé
            <span v-if="syncState.lastSyncDate" class="text-gray-500">
              · {{ formatLastSync(syncState.lastSyncDate) }}
            </span>
          </span>
          <span v-else>
            Connecté · Import initial en attente
          </span>
        </p>

        <!-- Manual refresh button (discreet) -->
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
          Actualiser
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import DefaultProviderSetupView from '@/components/providers/DefaultProviderSetup.vue'
import { ToastService } from '@/services/ToastService'
import { DataProviderPluginManager } from '@/services/DataProviderPluginManager'
import {
  getTokens,
  setTokens,
  deleteTokens,
  getSyncState,
  updateSyncState,
  type GarminSyncState
} from './storage'
import { getGarminSyncManager, syncEmitter, type SyncCompleteEvent, type SyncProgressEvent } from './GarminSyncManager'
import pluginEnv from './env'

// TODO: migration db - migrate old garmin_token/garmin_token_secret to new format
// This should be handled by a global migration system later

const isConnected = ref(false)
const isRefreshing = ref(false)
const isWaitingForOAuth = ref(false)
const showFallbackRedirect = ref(false)
const oauthPopup = ref<Window | null>(null)
const syncProgress = ref<{ month: string; completed: number; total: number } | null>(null)
const syncState = reactive<GarminSyncState>({
  status: 'idle',
  initialImportDone: false,
  backfillAskedMonths: [],
  backfillSyncedMonths: [],
  lastSyncDate: null,
  lastError: null
})

const baseURL = pluginEnv.apiUrl

// ============================================================================
// OAuth Flow (Popup-based to fix Samsung Android browser switching issue)
// ============================================================================

function connectToGarmin() {
  // Generate CSRF state token
  const state = crypto.randomUUID()
  sessionStorage.setItem('garmin_oauth_state', state)

  const callbackUrl = `${window.location.origin}/oauth/garmin/callback`
  const authUrl = `${baseURL}/auth/login?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`

  // Open centered popup
  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  oauthPopup.value = window.open(
    authUrl,
    'GarminOAuth',
    `width=${width},height=${height},left=${left},top=${top},popup=yes`
  )

  // Check if popup was blocked
  if (!oauthPopup.value || oauthPopup.value.closed) {
    handlePopupBlocked()
    return
  }

  isWaitingForOAuth.value = true
  showFallbackRedirect.value = false
  window.addEventListener('message', handleOAuthMessage)

  // Poll to detect if popup closes without completing OAuth
  const pollInterval = setInterval(() => {
    if (oauthPopup.value?.closed) {
      clearInterval(pollInterval)
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
  isWaitingForOAuth.value = false
  oauthPopup.value?.close()

  // Validate state (CSRF protection)
  const expectedState = sessionStorage.getItem('garmin_oauth_state')
  if (event.data.state !== expectedState) {
    ToastService.push('Erreur de sécurité OAuth (state mismatch)', { type: 'error' })
    return
  }
  sessionStorage.removeItem('garmin_oauth_state')

  // Handle error from OAuth provider
  if (event.data.error) {
    ToastService.push(`Garmin: ${event.data.error}`, { type: 'error' })
    return
  }

  // Save tokens and start import
  const { access_token, access_token_secret } = event.data
  if (access_token && access_token_secret) {
    await setTokens({ accessToken: access_token, accessTokenSecret: access_token_secret })
    isConnected.value = true

    // Enable the plugin so triggerRefresh() includes it
    const pluginManager = DataProviderPluginManager.getInstance()
    await pluginManager.enablePlugin('garmin')

    // Start initial import in background
    const syncManager = getGarminSyncManager()
    await syncManager.startInitialImportAsync()

    ToastService.push('Garmin connecté ! Import en cours...', { type: 'info' })
  }
}

function handlePopupBlocked() {
  isWaitingForOAuth.value = false
  showFallbackRedirect.value = true
  ToastService.push('Popup bloquée. Autorisez les popups ou utilisez le fallback.', { type: 'warning' })
}

function handleOAuthCancelled() {
  window.removeEventListener('message', handleOAuthMessage)
  isWaitingForOAuth.value = false
  sessionStorage.removeItem('garmin_oauth_state')
}

function connectWithRedirect() {
  // Fallback: classic redirect method (may open in different browser on Samsung)
  const redirect = encodeURIComponent(window.location.href)
  window.location.href = `${baseURL}/auth/login?redirect_uri=${redirect}`
}

async function disconnectGarmin() {
  await deleteTokens()
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
    ToastService.push(`Garmin: ${count} activités synchronisées`, { type: 'success' })
  } catch (err: any) {
    ToastService.push(`Garmin: ${err.message || 'Erreur'}`, { type: 'error' })
  } finally {
    isRefreshing.value = false
    Object.assign(syncState, await getSyncState())
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleSyncComplete(event: Event) {
  const { success, count, error } = (event as CustomEvent<SyncCompleteEvent>).detail

  if (success) {
    ToastService.push(`Garmin: ${count} activités importées`, { type: 'success' })
  } else {
    ToastService.push(`Garmin: ${error || 'Erreur d\'import'}`, { type: 'error' })
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

  if (minutes < 1) return 'il y a quelques secondes'
  if (minutes < 60) return `il y a ${minutes} min`
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${days}j`
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  // Listen for sync events
  syncEmitter.addEventListener('sync-complete', handleSyncComplete)
  syncEmitter.addEventListener('sync-progress', handleSyncProgress)

  // Check URL params for OAuth callback
  const params = new URLSearchParams(window.location.search)
  const token = params.get('access_token')
  const secret = params.get('access_token_secret')

  if (token && secret) {
    // Fresh OAuth return - save tokens
    await setTokens({ accessToken: token, accessTokenSecret: secret })
    isConnected.value = true

    // Enable the plugin so triggerRefresh() includes it
    const pluginManager = DataProviderPluginManager.getInstance()
    await pluginManager.enablePlugin('garmin')

    // Clean URL
    window.history.replaceState({}, '', window.location.pathname)

    // Start initial import in background
    const syncManager = getGarminSyncManager()
    await syncManager.startInitialImportAsync()

    ToastService.push('Garmin connecté ! Import en cours...', { type: 'info' })
  } else {
    // Check existing tokens
    const tokens = await getTokens()
    if (tokens) {
      isConnected.value = true

      // Ensure plugin is enabled (migrates old setups)
      const pluginManager = DataProviderPluginManager.getInstance()
      await pluginManager.enablePlugin('garmin')

      // Check if initial import needs to be resumed
      const state = await getSyncState()
      if (!state.initialImportDone && state.status !== 'syncing') {
        const syncManager = getGarminSyncManager()
        await syncManager.startInitialImportAsync()
      }
    }
  }

  // Load current sync state
  Object.assign(syncState, await getSyncState())
})

onUnmounted(() => {
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
  color: white;
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
