<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div>
    <DefaultProviderSetupView
      provider-name="Strava"
      :is-connected="isConnected"
      :is-loading="isWaitingForOAuth"
      @connect="connectToStrava"
      @disconnect="disconnectStrava"
    />

    <div v-if="isConnected" class="mt-6 text-center" data-test="strava-status-section">
      <div v-if="syncState.status === 'syncing'" class="text-gray-600">
        <i class="fas fa-sync-alt fa-spin mr-2" aria-hidden="true"></i>
        <span>{{
          syncProgress
            ? t('providers.importingCount', { count: syncProgress })
            : t('providers.importing')
        }}</span>
      </div>
      <div v-else-if="syncState.status === 'error'" class="text-red-600">
        <i class="fas fa-exclamation-triangle mr-2" aria-hidden="true"></i>
        <span>{{ t('providers.errorLabel', { message: syncState.lastError }) }}</span>
        <button @click="retryImport" class="ml-4 text-sm text-blue-600 hover:underline">
          {{ t('providers.retry') }}
        </button>
      </div>
      <div v-else class="space-y-2">
        <p class="text-gray-700">
          <i class="fas fa-check-circle text-green-600 mr-2" aria-hidden="true"></i>
          <span v-if="syncState.initialImportDone">{{ t('providers.synced') }}</span>
          <span v-else>{{ t('providers.connectedPending') }}</span>
        </p>
        <button
          @click="manualRefresh"
          :disabled="isRefreshing"
          class="text-sm text-gray-500 hover:text-gray-700 transition"
          data-test="strava-refresh-button"
        >
          <i
            class="fas fa-sync-alt mr-1"
            :class="{ 'fa-spin': isRefreshing }"
            aria-hidden="true"
          ></i>
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import DefaultProviderSetupView from '@/components/providers/DefaultProviderSetup.vue'
import { usePluginContext } from '@/composables/usePluginContext'
import {
  getTokens,
  deleteTokens,
  getSyncState,
  updateSyncState,
  type StravaSyncState
} from './storage'
import {
  getStravaSyncManager,
  syncEmitter,
  type SyncCompleteEvent,
  type SyncProgressEvent
} from './StravaSyncManager'
import { exchangeCodeForTokens } from './stravaAuth'
import pluginEnv from './env'

const isConnected = ref(false)
const isRefreshing = ref(false)
const isWaitingForOAuth = ref(false)
const syncProgress = ref<number | null>(null)
let oauthPopup: Window | null = null
let oauthChannel: BroadcastChannel | null = null

const syncState = reactive<StravaSyncState>({
  status: 'idle',
  initialImportDone: false,
  lastActivityDate: null,
  lastSyncDate: null,
  lastError: null
})

const ctx = usePluginContext()
const { notifications, plugins } = ctx
const { t } = useI18n()

function buildAuthUrl(state: string): string {
  const redirectUri = `${window.location.origin}/oauth/strava/callback`
  return (
    `${pluginEnv.authUrl}?client_id=${pluginEnv.clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&approval_prompt=auto` +
    `&scope=${encodeURIComponent('activity:read_all')}` +
    `&state=${state}`
  )
}

async function connectToStrava() {
  const state = crypto.randomUUID()
  sessionStorage.setItem('strava_oauth_state', state)

  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  oauthPopup = window.open(
    buildAuthUrl(state),
    'StravaOAuth',
    `width=${width},height=${height},left=${left},top=${top},popup=yes`
  )

  if (!oauthPopup || oauthPopup.closed) {
    // Popup blocked — fall back to full redirect.
    window.location.href = buildAuthUrl(state)
    return
  }

  isWaitingForOAuth.value = true
  window.addEventListener('message', handleOAuthMessage)
  oauthChannel = new BroadcastChannel('strava-oauth')
  oauthChannel.onmessage = (event: MessageEvent) =>
    handleOAuthMessage({ ...event, origin: window.location.origin } as MessageEvent)
}

async function handleOAuthMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  if (event.data?.type !== 'strava-oauth-callback') return

  window.removeEventListener('message', handleOAuthMessage)
  cleanupChannel()
  isWaitingForOAuth.value = false
  oauthPopup?.close()

  const expectedState = sessionStorage.getItem('strava_oauth_state')
  if (event.data.state !== expectedState) {
    notifications.notify(t('providers.notify.stateMismatch'), { type: 'error' })
    return
  }
  sessionStorage.removeItem('strava_oauth_state')

  if (event.data.error) {
    notifications.notify(
      t('providers.notify.generic', { provider: 'Strava', message: event.data.error }),
      { type: 'error' }
    )
    return
  }

  await completeConnection(event.data.code)
}

async function completeConnection(code: string | null) {
  if (!code) return
  try {
    await exchangeCodeForTokens(code)
    isConnected.value = true
    await plugins.enablePlugin('strava')
    getStravaSyncManager().startInitialImportAsync()
    notifications.notify(t('providers.notify.connected', { provider: 'Strava' }), { type: 'info' })
  } catch (err: unknown) {
    notifications.notify(
      t('providers.notify.generic', {
        provider: 'Strava',
        message: err instanceof Error ? err.message : 'Error'
      }),
      { type: 'error' }
    )
  }
}

function cleanupChannel() {
  if (oauthChannel) {
    oauthChannel.close()
    oauthChannel = null
  }
}

async function disconnectStrava() {
  const all = await ctx.activity.getAllActivities()
  const stravaActivities = all.filter((a: { id: string }) => a.id.startsWith('strava_'))
  for (const activity of stravaActivities) await ctx.activity.deleteActivity(activity.id)

  await deleteTokens()
  await updateSyncState({
    status: 'idle',
    initialImportDone: false,
    lastActivityDate: null,
    lastSyncDate: null,
    lastError: null
  })
  isConnected.value = false
  Object.assign(syncState, await getSyncState())
  notifications.notify(
    t('providers.notify.disconnected', {
      provider: 'Strava',
      count: stravaActivities.length
    }),
    {
      type: 'info'
    }
  )
}

async function retryImport() {
  await updateSyncState({ status: 'idle', lastError: null, initialImportDone: false })
  Object.assign(syncState, await getSyncState())
  getStravaSyncManager().startInitialImportAsync()
}

async function manualRefresh() {
  isRefreshing.value = true
  try {
    const count = await getStravaSyncManager().dailyRefresh()
    notifications.notify(t('providers.notify.synced', { provider: 'Strava', count }), {
      type: 'success'
    })
  } catch (err: unknown) {
    notifications.notify(
      t('providers.notify.generic', {
        provider: 'Strava',
        message: err instanceof Error ? err.message : 'Error'
      }),
      { type: 'error' }
    )
  } finally {
    isRefreshing.value = false
    Object.assign(syncState, await getSyncState())
  }
}

function handleSyncComplete(event: Event) {
  const { success, count, error } = (event as CustomEvent<SyncCompleteEvent>).detail
  notifications.notify(
    success
      ? t('providers.notify.imported', { provider: 'Strava', count })
      : t('providers.notify.generic', {
          provider: 'Strava',
          message: error || t('providers.notify.importError')
        }),
    { type: success ? 'success' : 'error' }
  )
  syncProgress.value = null
  getSyncState().then(state => Object.assign(syncState, state))
}

function handleSyncProgress(event: Event) {
  const detail = (event as CustomEvent<SyncProgressEvent>).detail
  if (detail.type === 'started') {
    syncState.status = 'syncing'
    syncProgress.value = null
  } else if (detail.type === 'progress') {
    syncProgress.value = detail.completed ?? null
  }
}

onMounted(async () => {
  syncEmitter.addEventListener('sync-complete', handleSyncComplete)
  syncEmitter.addEventListener('sync-progress', handleSyncProgress)

  // Redirect-callback flow (popup blocked): code+state arrive as URL params.
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (code && state) {
    const expectedState = sessionStorage.getItem('strava_oauth_state')
    sessionStorage.removeItem('strava_oauth_state')
    if (state === expectedState) await completeConnection(code)
    window.history.replaceState({}, '', window.location.pathname)
  } else {
    const tokens = await getTokens()
    if (tokens) {
      isConnected.value = true
      await plugins.enablePlugin('strava')
      const current = await getSyncState()
      if (!current.initialImportDone) getStravaSyncManager().startInitialImportAsync()
    }
  }

  const loaded = await getSyncState()
  if (loaded.status === 'syncing') {
    loaded.status = 'idle'
    await updateSyncState({ status: 'idle' })
  }
  Object.assign(syncState, loaded)
})

onUnmounted(() => {
  window.removeEventListener('message', handleOAuthMessage)
  cleanupChannel()
  syncEmitter.removeEventListener('sync-complete', handleSyncComplete)
  syncEmitter.removeEventListener('sync-progress', handleSyncProgress)
})
</script>
