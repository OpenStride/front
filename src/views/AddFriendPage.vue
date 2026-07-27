<template>
  <div class="add-friend-page">
    <!-- Loading State -->
    <div v-if="loading" class="card" data-test="add-friend-loading">
      <i class="fas fa-spinner fa-spin loading-icon" aria-hidden="true"></i>
      <p class="loading-text">
        {{ adding ? t('addFriend.adding') : t('addFriend.loadingProfile') }}
      </p>
    </div>

    <!-- Confirmation: who am I about to follow? -->
    <div v-else-if="preview" class="card" data-test="add-friend-confirm">
      <div class="avatar">
        <img v-if="preview.profile.profilePhoto" :src="preview.profile.profilePhoto" alt="" />
        <span v-else>{{ preview.profile.username.charAt(0).toUpperCase() }}</span>
      </div>
      <h2 class="name">{{ preview.profile.username }}</h2>
      <p v-if="preview.profile.bio" class="bio">{{ preview.profile.bio }}</p>

      <ul class="stats">
        <li>
          <strong>{{ preview.stats.totalActivities }}</strong>
          <span>{{ t('addFriend.activities') }}</span>
        </li>
        <li>
          <strong>{{ Math.round(preview.stats.totalDistance / 1000) }}</strong>
          <span>{{ t('addFriend.kilometers') }}</span>
        </li>
      </ul>

      <p v-if="alreadyAdded" class="already" data-test="already-added">
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {{ t('addFriend.alreadyAdded') }}
      </p>

      <p v-else-if="moved" class="already" data-test="profile-moved">
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {{ t('addFriend.movedHelp', { name: preview.profile.username }) }}
      </p>

      <p v-else class="explain">{{ t('addFriend.confirmHelp') }}</p>

      <div class="actions">
        <button
          v-if="!alreadyAdded"
          @click="confirmAdd"
          class="primary-btn"
          data-test="confirm-add"
        >
          <i :class="moved ? 'fas fa-link' : 'fas fa-user-plus'" aria-hidden="true"></i>
          {{
            moved
              ? t('addFriend.updateLink')
              : t('addFriend.confirm', { name: preview.profile.username })
          }}
        </button>
        <button @click="goToFriends" class="back-btn">
          {{ alreadyAdded ? t('addFriend.backToFriends') : t('common.cancel') }}
        </button>
      </div>
    </div>

    <!-- Added: half the handshake is done, explain the other half -->
    <div v-else-if="success" class="card" data-test="add-friend-success">
      <i class="fas fa-check-circle success-icon" aria-hidden="true"></i>
      <h2>{{ t('addFriend.added', { name: friendName }) }}</h2>

      <div class="next-step">
        <h3>{{ t('addFriend.nextStepTitle') }}</h3>
        <p>{{ published ? t('addFriend.nextStepShare') : t('addFriend.nextStepPublish') }}</p>
        <router-link to="/profile?tab=friends" class="primary-btn" data-test="next-step-action">
          <i :class="published ? 'fas fa-qrcode' : 'fas fa-upload'" aria-hidden="true"></i>
          {{ published ? t('addFriend.showMyQr') : t('addFriend.publishMyProfile') }}
        </router-link>
      </div>

      <button @click="goToFriends" class="back-btn">
        {{ t('addFriend.seeTheirActivities') }}
      </button>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="card" data-test="add-friend-error">
      <i class="fas fa-exclamation-circle error-icon" aria-hidden="true"></i>
      <h2>{{ t('addFriend.error') }}</h2>
      <p class="error-message">{{ errorMessage }}</p>
      <div class="actions">
        <button @click="retry" class="primary-btn">
          <i class="fas fa-redo" aria-hidden="true"></i>
          {{ t('addFriend.retry') }}
        </button>
        <button @click="goToFriends" class="back-btn">
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          {{ t('common.back') }}
        </button>
      </div>
    </div>

    <!-- Invalid Link State -->
    <div v-else-if="invalidLink" class="card" data-test="add-friend-invalid">
      <i class="fas fa-link-slash error-icon" aria-hidden="true"></i>
      <h2>{{ t('addFriend.invalidLink') }}</h2>
      <p class="invalid-text">{{ t('addFriend.invalidLinkHelp') }}</p>
      <button @click="goToFriends" class="back-btn">
        <i class="fas fa-users" aria-hidden="true"></i>
        {{ t('addFriend.backToFriends') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FriendService } from '@/services/FriendService'
import { ShareUrlService } from '@/services/ShareUrlService'
import type { PublicManifest } from '@/types/friend'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const friendService = FriendService.getInstance()

const loading = ref(true)
const adding = ref(false)
const success = ref(false)
const error = ref(false)
const invalidLink = ref(false)
const preview = ref<PublicManifest | null>(null)
const alreadyAdded = ref(false)
const moved = ref(false)
const published = ref(false)
const friendName = ref('')
const errorMessage = ref('')
const manifestUrl = ref<string | null>(null)

onMounted(async () => {
  await processDeepLink()
})

/**
 * Load the profile behind the link. Adding is the user's call, made on the next
 * screen: following someone writes to this device and republishes our following
 * list, which is not something a link should decide on its own.
 */
async function processDeepLink() {
  try {
    // Vue Router already decodes query parameters — no need for decodeURIComponent
    const manifestParam = route.query.manifest as string | undefined

    if (!manifestParam) {
      console.warn('[AddFriendPage] Missing manifest parameter')
      invalidLink.value = true
      loading.value = false
      return
    }

    manifestUrl.value = manifestParam

    if (!ShareUrlService.isValidManifestUrl(manifestUrl.value)) {
      console.error('[AddFriendPage] Invalid manifest URL domain')
      invalidLink.value = true
      loading.value = false
      return
    }

    const result = await friendService.previewFriend(manifestUrl.value)

    if (!result) {
      error.value = true
      errorMessage.value = t('addFriend.profileUnreachable')
      loading.value = false
      return
    }

    preview.value = result.manifest
    alreadyAdded.value = Boolean(result.alreadyAdded)
    moved.value = Boolean(result.movedFrom)
    loading.value = false
  } catch (err) {
    console.error('[AddFriendPage] Error processing deep link:', err)
    error.value = true
    errorMessage.value = err instanceof Error ? err.message : t('addFriend.unknownError')
    loading.value = false
  }
}

async function confirmAdd() {
  if (!manifestUrl.value) return

  loading.value = true
  adding.value = true

  try {
    const friend = await friendService.addFriendByUrl(manifestUrl.value)

    if (!friend) {
      error.value = true
      errorMessage.value = t('addFriend.profileUnreachable')
      return
    }

    friendName.value = friend.username
    // Drives which half of the handshake we explain next
    published.value = await friendService.hasPublishedData()
    preview.value = null
    success.value = true
  } catch (err) {
    console.error('[AddFriendPage] Error adding friend:', err)
    error.value = true
    errorMessage.value = err instanceof Error ? err.message : t('addFriend.unknownError')
  } finally {
    loading.value = false
    adding.value = false
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
  min-height: 70vh;
  padding: 2rem 1rem;
  text-align: center;
}

.card {
  max-width: 420px;
  width: 100%;
  padding: 2rem 1.75rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.card h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 0.5rem;
}

/* — Confirmation — */
.avatar {
  width: 84px;
  height: 84px;
  margin: 0 auto 1rem;
  border-radius: var(--radius-pill);
  overflow: hidden;
  background: var(--surface-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-muted);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.name {
  margin-bottom: 0.25rem;
}

.bio {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0 0 1rem;
}

.stats {
  list-style: none;
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 0;
  margin: 1rem 0 1.25rem;
}

.stats li {
  display: flex;
  flex-direction: column;
}

.stats strong {
  font-family: var(--font-mono);
  font-size: 1.3rem;
  color: var(--text-color);
}

.stats span {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.explain,
.invalid-text,
.error-message {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 1.5rem;
}

.already {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin: 0 0 1rem;
}

/* — Next step after adding — */
.next-step {
  margin: 1.5rem 0;
  padding: 1.25rem;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  text-align: left;
}

.next-step h3 {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--text-color);
}

.next-step p {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 1rem;
}

/* — Icons — */
.loading-icon {
  font-size: 3rem;
  color: var(--color-green-500);
  margin-bottom: 1.25rem;
}

.loading-text {
  font-size: 1rem;
  color: var(--text-muted);
  margin: 0;
}

.success-icon {
  font-size: 3rem;
  color: var(--color-green-500);
  margin-bottom: 1rem;
}

.error-icon {
  font-size: 3rem;
  color: var(--color-red-500);
  margin-bottom: 1rem;
}

/* — Buttons — */
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.primary-btn,
.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s;
}

.primary-btn {
  background: var(--color-green-500);
  color: var(--color-white);
  width: 100%;
}

.primary-btn:hover {
  background: var(--color-green-600);
}

.back-btn {
  background: var(--surface-2);
  color: var(--text-color);
  width: 100%;
}

.back-btn:hover {
  background: var(--surface-muted);
}
</style>
