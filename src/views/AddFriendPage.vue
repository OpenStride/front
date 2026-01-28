<template>
  <div class="add-friend-page">
    <!-- Loading State -->
    <div v-if="loading" class="loading-container">
      <i class="fas fa-spinner fa-spin loading-icon" aria-hidden="true"></i>
      <p class="loading-text">Ajout de votre ami...</p>
    </div>

    <!-- Success State -->
    <div v-else-if="success" class="success-container">
      <i class="fas fa-check-circle success-icon" aria-hidden="true"></i>
      <h2>{{ friendName }} ajouté !</h2>
      <p class="redirect-text">Redirection vers vos amis...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-container">
      <i class="fas fa-exclamation-circle error-icon" aria-hidden="true"></i>
      <h2>Erreur</h2>
      <p class="error-message">{{ errorMessage }}</p>
      <div class="error-actions">
        <button @click="retry" class="retry-btn">
          <i class="fas fa-redo" aria-hidden="true"></i>
          Réessayer
        </button>
        <button @click="goToFriends" class="back-btn">
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          Retour
        </button>
      </div>
    </div>

    <!-- Invalid Link State -->
    <div v-else-if="invalidLink" class="invalid-container">
      <i class="fas fa-link-slash error-icon" aria-hidden="true"></i>
      <h2>Lien invalide</h2>
      <p class="invalid-text">Ce lien de partage n'est pas valide ou a expiré.</p>
      <button @click="goToFriends" class="back-btn">
        <i class="fas fa-users" aria-hidden="true"></i>
        Retour aux amis
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FriendService } from '@/services/FriendService'
import { ToastService } from '@/services/ToastService'
import { ShareUrlService } from '@/services/ShareUrlService'
import type { FriendServiceEvent } from '@/types/friend'

const route = useRoute()
const router = useRouter()
const friendService = FriendService.getInstance()

const loading = ref(true)
const success = ref(false)
const error = ref(false)
const invalidLink = ref(false)
const friendName = ref('')
const errorMessage = ref('')
const manifestUrl = ref<string | null>(null)

// Event listener for FriendService events
const handleFriendEvent = (event: Event) => {
  const customEvent = event as CustomEvent<FriendServiceEvent>
  const { type, message, messageType } = customEvent.detail

  if (message && messageType) {
    ToastService.push(message, {
      type: messageType,
      timeout: messageType === 'error' ? 5000 : messageType === 'warning' ? 4000 : 3000
    })
  }
}

onMounted(async () => {
  // Listen to FriendService events
  friendService.emitter.addEventListener('friend-event', handleFriendEvent)

  await processDeepLink()
})

onUnmounted(() => {
  // Clean up event listener
  friendService.emitter.removeEventListener('friend-event', handleFriendEvent)
})

async function processDeepLink() {
  try {
    // Extract manifest parameter from query string
    const manifestParam = route.query.manifest as string | undefined

    if (!manifestParam) {
      console.warn('[AddFriendPage] Missing manifest parameter')
      invalidLink.value = true
      loading.value = false
      return
    }

    // Decode manifest URL
    manifestUrl.value = decodeURIComponent(manifestParam)
    console.log('[AddFriendPage] Processing manifest URL:', manifestUrl.value)

    // Validate manifest URL
    if (!ShareUrlService.isValidManifestUrl(manifestUrl.value)) {
      console.error('[AddFriendPage] Invalid manifest URL domain')
      invalidLink.value = true
      loading.value = false
      return
    }

    // Add friend using FriendService
    const friend = await friendService.addFriendByUrl(manifestUrl.value)

    if (friend) {
      console.log('[AddFriendPage] Friend added successfully:', friend.username)
      success.value = true
      friendName.value = friend.username
      loading.value = false

      // Redirect to friends page after 2 seconds
      setTimeout(() => {
        router.push('/friends')
      }, 2000)
    } else {
      throw new Error('Échec ajout ami')
    }
  } catch (err) {
    console.error('[AddFriendPage] Error processing deep link:', err)
    error.value = true
    errorMessage.value = err instanceof Error ? err.message : 'Erreur inconnue'
    loading.value = false
  }
}

async function retry() {
  error.value = false
  success.value = false
  loading.value = true
  await processDeepLink()
}

function goToFriends() {
  router.push('/friends')
}
</script>

<style scoped>
.add-friend-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e9ecef 100%);
}

.loading-container,
.success-container,
.error-container,
.invalid-container {
  max-width: 400px;
  width: 100%;
  padding: 2.5rem 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

/* Loading State */
.loading-icon {
  font-size: 4rem;
  color: var(--color-green-500);
  margin-bottom: 1.5rem;
}

.loading-text {
  font-size: 1.125rem;
  color: #6b7280;
  margin: 0;
}

/* Success State */
.success-icon {
  font-size: 4rem;
  color: var(--color-green-500);
  margin-bottom: 1rem;
}

.success-container h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem;
}

.redirect-text {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
}

/* Error State */
.error-icon {
  font-size: 4rem;
  color: #ef4444;
  margin-bottom: 1rem;
}

.error-container h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.75rem;
}

.error-message {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 1.5rem;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Invalid Link State */
.invalid-container h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.75rem;
}

.invalid-text {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 1.5rem;
  line-height: 1.5;
}

/* Buttons */
button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.retry-btn {
  background: var(--color-green-500);
  color: white;
}

.retry-btn:hover {
  background: var(--color-green-600);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(136, 170, 0, 0.3);
}

.back-btn {
  background: #f3f4f6;
  color: #374151;
}

.back-btn:hover {
  background: #e5e7eb;
}

/* Mobile Responsive */
@media (max-width: 640px) {
  .add-friend-page {
    padding: 1rem;
  }

  .loading-container,
  .success-container,
  .error-container,
  .invalid-container {
    padding: 2rem 1.5rem;
  }

  .loading-icon,
  .success-icon,
  .error-icon {
    font-size: 3rem;
  }

  .error-actions {
    flex-direction: column;
    width: 100%;
  }

  button {
    width: 100%;
    justify-content: center;
  }
}
</style>
