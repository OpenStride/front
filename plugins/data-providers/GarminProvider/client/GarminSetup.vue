<template>
  <div>
    <DefaultProviderSetupView
      provider-name="Garmin"
      :is-connected="isConnected"
      @connect="connectToGarmin"
      @disconnect="disconnectGarmin"
    />

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
// OAuth Flow
// ============================================================================

function connectToGarmin() {
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
