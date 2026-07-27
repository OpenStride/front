<template>
  <div class="profile-friends">
    <!-- "Being followed" belongs with "following": the sharing plugin renders
         your own profile and QR code here -->
    <component
      v-for="(section, i) in sharingSections"
      :is="section"
      :key="`friends-section-${i}`"
      class="friends-sharing"
    />

    <div class="page-header">
      <div class="header-actions">
        <button @click="refreshAll" :disabled="refreshing" class="refresh-btn">
          <i :class="['fas fa-sync icon', { spinning: refreshing }]" aria-hidden="true"></i>
          {{ t('friendsList.sync') }}
        </button>
        <button @click="openScanner" class="add-btn">
          <i class="fas fa-user-plus icon" aria-hidden="true"></i>
          {{ t('friends.addFriend') }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">
      <p>{{ t('common.loading') }}</p>
    </div>

    <div v-else-if="friends.length === 0" class="empty-state">
      <div class="empty-icon">
        <i class="fas fa-user-friends" aria-hidden="true"></i>
      </div>
      <p class="empty-title">{{ t('friendsList.empty') }}</p>
      <p class="empty-description">
        {{ t('friendsList.emptyHelp') }}
      </p>
      <button @click="openScanner" class="empty-action-btn">
        <i class="fas fa-qrcode" aria-hidden="true"></i>
        {{ t('friendsList.scanQr') }}
      </button>
    </div>

    <div v-else class="friends-list">
      <div v-for="friend in friends" :key="friend.id" class="friend-card">
        <div class="friend-avatar">
          <img
            v-if="friend.profilePhoto"
            :src="friend.profilePhoto"
            :alt="friend.username"
            class="avatar-img"
          />
          <div v-else class="avatar-placeholder">
            {{ friend.username.charAt(0).toUpperCase() }}
          </div>
        </div>

        <div class="friend-info">
          <h3 class="friend-name">{{ friend.username }}</h3>
          <p v-if="friend.bio" class="friend-bio">{{ friend.bio }}</p>

          <!-- Following is one-way until they add you back, and that decides
               whether likes and comments work at all -->
          <span
            :class="['mutual-badge', { mutual: friend.followsMe }]"
            :data-test="`mutual-${friend.id}`"
          >
            <i
              :class="friend.followsMe ? 'fas fa-arrow-right-arrow-left' : 'fas fa-arrow-right'"
              aria-hidden="true"
            ></i>
            {{ friend.followsMe ? t('friendsList.mutual') : t('friendsList.notMutual') }}
          </span>

          <div class="friend-meta">
            <span class="meta-item">{{
              t('friendsList.addedOn', { date: formatDate(friend.addedAt) })
            }}</span>
            <span v-if="friend.lastFetched" class="meta-item">
              {{ t('friendsList.lastSync', { time: formatRelativeTime(friend.lastFetched) }) }}
            </span>
          </div>
        </div>

        <div class="friend-actions">
          <button
            @click="refreshFriend(friend.id)"
            :disabled="refreshingFriend === friend.id"
            class="action-btn refresh"
            :title="t('friendsList.sync')"
          >
            <i
              :class="['fas fa-sync icon-sm', { spinning: refreshingFriend === friend.id }]"
              aria-hidden="true"
            ></i>
          </button>

          <!-- Sync All button -->
          <button
            v-if="friend.syncEnabled && !friend.fullySynced"
            @click="syncAllActivities(friend.id)"
            :disabled="syncingFriendId === friend.id"
            class="action-btn sync-all"
            :title="t('friendsList.syncFull')"
          >
            <i
              v-if="syncingFriendId === friend.id"
              class="fas fa-spinner fa-spin icon-sm"
              aria-hidden="true"
            ></i>
            <i v-else class="fas fa-history icon-sm" aria-hidden="true"></i>
          </button>

          <!-- Show badge if fully synced -->
          <span
            v-if="friend.fullySynced"
            class="fully-synced-badge"
            :title="t('friendsList.syncedFull')"
          >
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          </span>

          <button
            @click="confirmRemove(friend)"
            class="action-btn remove"
            :title="t('friendsList.remove')"
          >
            <i class="fas fa-trash-alt" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- QR Scanner Modal -->
    <!-- Scanning navigates to /add-friend for confirmation; nothing to reload here -->
    <QRScanner :is-open="scannerOpen" @close="scannerOpen = false" />

    <!-- Remove Confirmation Modal -->
    <div v-if="friendToRemove" class="modal-overlay" @click.self="friendToRemove = null">
      <div class="modal-content">
        <h3>{{ t('friendsList.removeTitle', { name: friendToRemove.username }) }}</h3>
        <p>{{ t('friendsList.removeHelp') }}</p>
        <div class="modal-actions">
          <button @click="friendToRemove = null" class="cancel-btn">
            {{ t('common.cancel') }}
          </button>
          <button @click="removeFriend" class="confirm-btn">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref, computed, onMounted } from 'vue'
import { FriendService } from '@/services/FriendService'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import QRScanner from '@/components/QRScanner.vue'
import type { Friend } from '@/types/friend'

const { t, locale } = useI18n()

const friendService = FriendService.getInstance()

const { components: rawSharing } = useSlotExtensions('profile.friends')
const sharingSections = computed(() =>
  rawSharing.value.map(c => (c as { default?: unknown }).default || c)
)

const friends = ref<Friend[]>([])
const loading = ref(true)
const refreshing = ref(false)
const refreshingFriend = ref<string | null>(null)
const syncingFriendId = ref<string | null>(null)
const scannerOpen = ref(false)
const friendToRemove = ref<Friend | null>(null)

// Toasts for friend events are handled once, in the layout
onMounted(async () => {
  await loadFriends()
})

const loadFriends = async () => {
  loading.value = true
  try {
    friends.value = await friendService.getAllFriends()
    // Sort by most recently added
    friends.value.sort((a, b) => b.addedAt - a.addedAt)
  } catch (error) {
    console.error('[ProfileFriends] Error loading friends:', error)
  } finally {
    loading.value = false
  }
}

const openScanner = () => {
  scannerOpen.value = true
}

const refreshAll = async () => {
  refreshing.value = true
  try {
    await friendService.refreshAllFriends()
    await loadFriends()
  } catch (error) {
    console.error('[ProfileFriends] Error refreshing friends:', error)
  } finally {
    refreshing.value = false
  }
}

const refreshFriend = async (friendId: string) => {
  refreshingFriend.value = friendId
  try {
    await friendService.syncFriendActivitiesQuick(friendId, 30)
    await loadFriends()
  } catch (error) {
    console.error('[ProfileFriends] Error refreshing friend:', error)
  } finally {
    refreshingFriend.value = null
  }
}

const syncAllActivities = async (friendId: string) => {
  syncingFriendId.value = friendId
  try {
    const result = await friendService.syncFriendActivitiesAll(friendId)

    if (result.success) {
      console.log(
        `[ProfileFriends] Full sync completed: ${result.activitiesAdded} new, ${result.totalActivities} total`
      )
    } else {
      console.error('[ProfileFriends] Full sync failed:', result.error)
    }

    await loadFriends()
  } catch (error) {
    console.error('[ProfileFriends] Error syncing all activities:', error)
  } finally {
    syncingFriendId.value = null
  }
}

const confirmRemove = (friend: Friend) => {
  friendToRemove.value = friend
}

const removeFriend = async () => {
  if (!friendToRemove.value) return

  await friendService.removeFriend(friendToRemove.value.id)
  friendToRemove.value = null
  await loadFriends()
}

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { count: minutes })
  if (hours < 24) return t('time.hoursAgo', { count: hours })
  return t('time.daysAgo', { count: days })
}
</script>

<style scoped>
.profile-friends {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.refresh-btn,
.add-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-btn {
  background: var(--color-gray-100);
  color: var(--color-gray-700);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--color-gray-200);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-btn {
  background: var(--color-green-500);
  color: var(--color-white);
}

.add-btn:hover {
  background: var(--color-green-600);
}

.icon {
  font-size: 1rem;
}

.icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-gray-500);
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-gray-900);
  margin-bottom: 0.5rem;
}

.empty-description {
  color: var(--color-gray-500);
  margin-bottom: 2rem;
}

.empty-action-btn {
  padding: 0.75rem 1.5rem;
  background: var(--color-green-500);
  color: var(--color-white);
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
}

.empty-action-btn:hover {
  background: var(--color-green-600);
}

.friends-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.friend-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: var(--color-white);
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.2s;
}

.friend-card:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.friend-avatar {
  flex-shrink: 0;
}

.avatar-img,
.avatar-placeholder {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-green-500);
  color: var(--color-white);
  font-size: 1.5rem;
  font-weight: 600;
}

.friend-info {
  flex: 1;
  min-width: 0;
}

.friend-name {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
  color: var(--color-gray-900);
}

.friend-bio {
  font-size: 0.875rem;
  color: var(--color-gray-500);
  margin: 0 0 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: var(--color-gray-400);
}

.mutual-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.25rem 0 0.5rem;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: var(--surface-muted);
  color: var(--text-muted);
}

.mutual-badge.mutual {
  background: var(--color-green-100);
  color: var(--color-green-700);
}

.friend-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.action-btn {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1.125rem;
  transition: background 0.2s;
}

.action-btn.refresh {
  background: var(--color-gray-100);
}

.action-btn.refresh:hover:not(:disabled) {
  background: var(--color-gray-200);
}

.action-btn.refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.sync-all {
  background: var(--color-blue-100);
  color: var(--color-blue-800);
}

.action-btn.sync-all:hover:not(:disabled) {
  background: var(--color-blue-200);
}

.action-btn.sync-all:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.remove {
  background: var(--color-red-100);
}

.action-btn.remove:hover {
  background: var(--color-red-200);
}

.icon-sm {
  font-size: 1rem;
}

.icon-sm.spinning {
  animation: spin 1s linear infinite;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: var(--color-white);
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-content h3 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
  color: var(--color-gray-900);
}

.modal-content p {
  margin: 0 0 1.5rem;
  color: var(--color-gray-500);
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.cancel-btn,
.confirm-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.cancel-btn {
  background: var(--color-gray-100);
  color: var(--color-gray-700);
}

.cancel-btn:hover {
  background: var(--color-gray-200);
}

.confirm-btn {
  background: var(--color-red-500);
  color: var(--color-white);
}

.confirm-btn:hover {
  background: var(--color-red-600);
}

.fully-synced-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  background: var(--color-emerald-100);
  color: var(--color-emerald-800);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.fully-synced-badge i {
  font-size: 0.875rem;
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    flex-direction: column;
  }

  .friend-card {
    flex-wrap: wrap;
  }

  .friend-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
