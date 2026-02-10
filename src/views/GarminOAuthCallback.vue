<template>
  <div class="oauth-callback">
    <div v-if="status === 'processing'" class="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Connexion en cours...</span>
    </div>
    <div v-else-if="status === 'success'" class="status success">
      <i class="fas fa-check-circle" aria-hidden="true"></i>
      <span>Connecté ! Fermeture...</span>
    </div>
    <div v-else-if="status === 'error'" class="status error">
      <i class="fas fa-times-circle" aria-hidden="true"></i>
      <span>Erreur d'authentification</span>
    </div>
    <div v-else-if="status === 'no-opener'" class="status warning">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <p>Cette page s'est ouverte dans un autre navigateur.</p>
      <p class="hint">Retournez dans votre navigateur principal (Chrome) et réessayez.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const status = ref<'processing' | 'success' | 'error' | 'no-opener'>('processing')

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const accessToken = params.get('access_token')
  const accessTokenSecret = params.get('access_token_secret')
  const state = params.get('state')
  const error = params.get('error')

  // No opener = opened in a different browser (Samsung Internet issue)
  if (!window.opener) {
    status.value = 'no-opener'
    return
  }

  // Send tokens (or error) to the main window via postMessage
  window.opener.postMessage(
    {
      type: 'garmin-oauth-callback',
      access_token: accessToken,
      access_token_secret: accessTokenSecret,
      state: state,
      error: error
    },
    window.location.origin
  )

  status.value = error ? 'error' : 'success'

  // Auto-close popup after brief delay
  setTimeout(() => window.close(), 1500)
})
</script>

<style scoped>
.oauth-callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-gray-50, #f9fafb);
  font-family: system-ui, -apple-system, sans-serif;
}

.status {
  text-align: center;
  padding: 2rem;
  background: white;
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
