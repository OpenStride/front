<template>
  <div class="dropbox-setup" data-test="dropbox-setup">
    <header class="dropbox-setup__header">
      <img src="../assets/logo.svg" alt="" class="dropbox-setup__logo" />
      <h1 class="dropbox-setup__title">Dropbox</h1>
    </header>

    <!-- Build without a client id: connecting can only fail, so say why. -->
    <p v-if="!isConfigured" class="dropbox-setup__notice" data-test="dropbox-not-configured">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      {{ t('dropbox.notConfigured') }}
    </p>

    <p v-else-if="connectionState === 'pending'" class="dropbox-setup__notice">
      <i class="fas fa-sync fa-spin" aria-hidden="true"></i>
      {{ t('dropbox.checking') }}
    </p>

    <div v-else-if="connectionState === 'connected'" class="dropbox-setup__body">
      <p class="dropbox-setup__status dropbox-setup__status--ok" data-test="dropbox-connected">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        {{ t('dropbox.connected') }}
      </p>
      <p class="dropbox-setup__hint">
        <i class="fas fa-lock" aria-hidden="true"></i>
        {{ t('dropbox.appFolderNote') }}
      </p>

      <div class="dropbox-setup__actions">
        <button
          class="dropbox-setup__btn dropbox-setup__btn--primary"
          :disabled="isRefreshing"
          data-test="dropbox-refresh"
          @click="onRefresh"
        >
          <i class="fas fa-sync" :class="{ 'fa-spin': isRefreshing }" aria-hidden="true"></i>
          <span>{{ refreshLabel }}</span>
        </button>

        <button
          class="dropbox-setup__btn dropbox-setup__btn--primary"
          data-test="dropbox-reconnect"
          @click="onConnect"
        >
          <i class="fas fa-plug" aria-hidden="true"></i>
          <span>{{ t('dropbox.reconnect') }}</span>
        </button>
      </div>

      <div class="dropbox-setup__actions">
        <button
          class="dropbox-setup__btn dropbox-setup__btn--muted"
          data-test="dropbox-disconnect"
          @click="onDisconnect"
        >
          <i class="fas fa-unlink" aria-hidden="true"></i>
          <span>{{ t('dropbox.disconnect') }}</span>
        </button>
      </div>

      <div class="dropbox-setup__advanced">
        <button
          class="dropbox-setup__link"
          :disabled="isForcing"
          data-test="dropbox-force-resync"
          @click="onForceResync"
        >
          <i class="fas fa-rotate" :class="{ 'fa-spin': isForcing }" aria-hidden="true"></i>
          <span>{{ isForcing ? t('dropbox.forceResyncRunning') : t('dropbox.forceResync') }}</span>
        </button>
        <p class="dropbox-setup__hint">{{ t('dropbox.forceResyncHint') }}</p>
      </div>
    </div>

    <div v-else class="dropbox-setup__body">
      <p class="dropbox-setup__hint">
        <i class="fas fa-lock" aria-hidden="true"></i>
        {{ t('dropbox.appFolderNote') }}
      </p>
      <div class="dropbox-setup__actions">
        <button
          class="dropbox-setup__btn dropbox-setup__btn--primary"
          data-test="dropbox-connect"
          @click="onConnect"
        >
          <i class="fas fa-plug" aria-hidden="true"></i>
          <span>{{ t('dropbox.connect') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { DropboxAuthService } from './DropboxAuthService'
import { usePluginContext } from '@/composables/usePluginContext'

const { t } = useI18n()
const { sync } = usePluginContext()

let authService: DropboxAuthService | null = null

const connectionState = ref<'pending' | 'connected' | 'disconnected'>('pending')
const isConfigured = ref(true)
const isRefreshing = ref(false)
const isRefreshed = ref(false)
const isForcing = ref(false)

const refreshLabel = computed(() => {
  if (isRefreshing.value) return t('dropbox.refreshing')
  if (isRefreshed.value) return t('dropbox.refreshed')
  return t('dropbox.refresh')
})

const onConnect = async () => {
  const uri = await authService?.getOauthSignInUri()
  if (!uri) {
    console.error('[Dropbox] Failed to build the OAuth sign-in URI')
    return
  }
  window.location.href = uri
}

async function onRefresh() {
  isRefreshing.value = true
  isRefreshed.value = false
  try {
    await sync.syncNow()
    isRefreshed.value = true
    setTimeout(() => {
      isRefreshed.value = false
    }, 2000)
  } catch (e) {
    console.error(e)
  } finally {
    isRefreshing.value = false
  }
}

async function onForceResync() {
  isForcing.value = true
  try {
    await sync.syncNow({ force: true })
  } catch (e) {
    console.error(e)
  } finally {
    isForcing.value = false
  }
}

const onDisconnect = async () => {
  await authService?.disconnect()
  connectionState.value = 'disconnected'
}

onMounted(async () => {
  authService = await DropboxAuthService.getInstance()
  isConfigured.value = authService.isConfigured

  // A ?code= on this route can only come from our own authorization request:
  // each provider redirects back to /storage-provider/<its own id>.
  const accessToken =
    (await authService.consumeRedirectCode()) ?? (await authService.getAccessToken())

  connectionState.value = accessToken ? 'connected' : 'disconnected'
})
</script>

<style scoped>
.dropbox-setup {
  max-width: 36rem;
  margin: 0 auto;
  padding: 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.dropbox-setup__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.dropbox-setup__logo {
  width: 2rem;
  height: 2rem;
}

.dropbox-setup__title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-color);
  margin: 0;
}

.dropbox-setup__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dropbox-setup__notice,
.dropbox-setup__status,
.dropbox-setup__hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
  text-align: center;
}

.dropbox-setup__status--ok {
  color: var(--color-green-700);
}

.dropbox-setup__actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.dropbox-setup__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: var(--font-weight-bold);
  border: none;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.dropbox-setup__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropbox-setup__btn--primary {
  background: var(--color-green-500);
  color: var(--surface);
}

.dropbox-setup__btn--primary:hover:not(:disabled) {
  background: var(--color-green-600);
}

.dropbox-setup__btn--muted {
  background: var(--surface-2);
  color: var(--text-color);
}

.dropbox-setup__btn--muted:hover:not(:disabled) {
  background: var(--surface-muted);
}

.dropbox-setup__advanced {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.dropbox-setup__link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-family: inherit;
  font-size: 0.875rem;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.dropbox-setup__link:hover:not(:disabled) {
  color: var(--text-color);
}

.dropbox-setup__link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropbox-setup__hint {
  font-size: 0.75rem;
  color: var(--text-faint);
}
</style>
