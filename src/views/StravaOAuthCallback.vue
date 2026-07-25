<template>
  <div class="oauth-callback">
    <div v-if="status === 'processing'" class="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Connecting...</span>
    </div>
    <div v-else-if="status === 'success'" class="status success">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      <span>Connected! Closing...</span>
    </div>
    <div v-else-if="status === 'error'" class="status error">
      <i class="fas fa-times-circle" aria-hidden="true"></i>
      <span>{{ errorMessage }}</span>
    </div>
    <div v-else-if="status === 'broadcast'" class="status success">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      <span>Connected! Redirecting...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const status = ref<'processing' | 'success' | 'error' | 'broadcast'>('processing')
const errorMessage = ref('Authentication error')

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (!code && !error) {
    errorMessage.value = 'Missing OAuth parameters'
    status.value = 'error'
    return
  }
  if (error) {
    errorMessage.value =
      error === 'access_denied' ? 'Access denied. You can try again.' : `OAuth error: ${error}`
  }

  const payload = { type: 'strava-oauth-callback', code, state, error }

  // Strategy 1: postMessage back to the opener (popup flow).
  if (window.opener) {
    window.opener.postMessage(payload, window.location.origin)
    status.value = error ? 'error' : 'success'
    setTimeout(() => window.close(), 1500)
    return
  }

  // Strategy 2: BroadcastChannel + redirect to the setup page (redirect flow).
  try {
    const channel = new BroadcastChannel('strava-oauth')
    channel.postMessage(payload)
    channel.close()
  } catch {
    // ignore — fall through to redirect
  }

  status.value = error ? 'error' : 'broadcast'
  setTimeout(() => {
    const setupUrl = new URL('/data-provider/strava', window.location.origin)
    if (error) setupUrl.searchParams.set('oauth_error', error)
    else {
      if (code) setupUrl.searchParams.set('code', code)
      if (state) setupUrl.searchParams.set('state', state)
    }
    window.location.href = setupUrl.toString()
  }, 1500)
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
.status span {
  color: var(--color-gray-700, #374151);
  font-size: 1rem;
}
.status.success i {
  color: var(--color-green-500, #88aa00);
}
.status.error i {
  color: var(--color-red-500, #ef4444);
}
</style>
