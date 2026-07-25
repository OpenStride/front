<template>
  <div class="oauth-callback">
    <div v-if="status === 'processing'" class="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{{ t('providers.callback.connecting') }}</span>
    </div>
    <div v-else-if="status === 'success'" class="status success">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      <span>{{ t('providers.callback.closing') }}</span>
    </div>
    <div v-else-if="status === 'error'" class="status error">
      <i class="fas fa-times-circle" aria-hidden="true"></i>
      <span>{{ errorMessage }}</span>
    </div>
    <div v-else-if="status === 'no-opener'" class="status warning">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <p>{{ t('providers.callback.wrongBrowser') }}</p>
      <p class="hint">{{ t('providers.callback.wrongBrowserHint') }}</p>
    </div>
    <div v-else-if="status === 'broadcast'" class="status success">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      <span>{{ t('providers.callback.redirecting') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const status = ref<'processing' | 'success' | 'error' | 'no-opener' | 'broadcast'>('processing')
const errorMessage = ref('Authentication error')

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  // No OAuth params at all — user navigated here directly
  if (!code && !error) {
    errorMessage.value = t('providers.callback.missingParams')
    status.value = 'error'
    return
  }

  // OAuth error (user denied access or provider error)
  if (error) {
    errorMessage.value =
      error === 'access_denied'
        ? t('providers.callback.accessDenied')
        : t('providers.callback.oauthError', { error })
  }

  const payload = {
    type: 'garmin-oauth-callback',
    code,
    state,
    error
  }

  // Strategy 1: postMessage via window.opener (works if opener ref survived)
  if (window.opener) {
    window.opener.postMessage(payload, window.location.origin)
    status.value = error ? 'error' : 'success'
    setTimeout(() => window.close(), 1500)
    return
  }

  // Strategy 2: BroadcastChannel (works same-origin even without opener ref)
  // Handles the case where cross-origin navigation (Garmin OAuth) nullifies window.opener
  try {
    const channel = new BroadcastChannel('garmin-oauth')
    channel.postMessage(payload)
    channel.close()

    if (error) {
      status.value = 'error'
      // Redirect to setup page with error so user sees feedback
      setTimeout(() => {
        const setupUrl = new URL('/data-provider/garmin', window.location.origin)
        setupUrl.searchParams.set('oauth_error', error)
        window.location.href = setupUrl.toString()
      }, 2000)
    } else {
      status.value = 'broadcast'
      // Redirect to Garmin setup page with code+state so it can exchange for tokens
      setTimeout(() => {
        const setupUrl = new URL('/data-provider/garmin', window.location.origin)
        if (code) setupUrl.searchParams.set('code', code)
        if (state) setupUrl.searchParams.set('state', state)
        window.location.href = setupUrl.toString()
      }, 1500)
    }
  } catch {
    // BroadcastChannel not supported — true no-opener fallback
    status.value = 'no-opener'
  }
})
</script>

<style scoped>
.oauth-callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-gray-50, #f9fafb);
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.status {
  text-align: center;
  padding: 2rem;
  background: var(--color-white);
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  max-width: 320px;
}

.status i {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  display: block;
}

.status span,
.status p {
  color: var(--color-gray-700, #374151);
  font-size: 1rem;
  margin: 0;
}

.status .hint {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-gray-500, #6b7280);
}

.status.success i {
  color: var(--color-green-500, #88aa00);
}

.status.error i {
  color: var(--color-red-500, #ef4444);
}

.status.warning i {
  color: var(--color-yellow-500, #f59e0b);
}
</style>
