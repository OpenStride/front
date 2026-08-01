<template>
  <div class="profile-panel profile-friends">
    <!-- "Being followed" belongs with "following": the sharing plugin renders
         your own profile and QR code here -->
    <component
      v-for="(section, i) in sharingSections"
      :is="section"
      :key="`friends-section-${i}`"
      class="friends-sharing"
    />

    <section class="friends-block">
      <div class="block-bar">
        <h3 class="block-title">
          {{ t('friendsList.title') }}
          <span v-if="friends.length" class="block-count">{{ friends.length }}</span>
        </h3>

        <!-- Two actions, both about the people in this list. "My QR code" used
             to sit here too, but it is about me, not about them — it belongs to
             the public-profile section above, and having it in both places was
             one modal behind two doors. -->
        <div class="actions">
          <button @click="openScanner" class="btn btn--primary" data-test="add-friend">
            <i class="fas fa-user-plus" aria-hidden="true"></i>
            {{ t('friends.addFriend') }}
          </button>
          <button
            @click="refreshAll"
            :disabled="refreshing"
            class="btn btn--quiet"
            data-test="sync-friends"
          >
            <i :class="['fas fa-sync', { spinning: refreshing }]" aria-hidden="true"></i>
            {{ t('friendsList.sync') }}
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
        <!-- No button here: "Add a friend" sits a few pixels above and opens
             the same scanner. Two buttons for one action is not an empty state,
             it is a duplicate. -->
        <p class="empty-description">
          {{ t('friendsList.emptyHelp') }}
        </p>
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
            <h4 class="friend-name">{{ friend.username }}</h4>
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
    </section>

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
const sharingSections = computed(() => rawSharing.value)

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
/* Layout, cards and buttons come from profile.css — this file keeps only what
   is specific to a friend row. */
.friends-block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--color-ink);
}

.block-count {
  padding: 0.05rem 0.45rem;
  border-radius: var(--radius-pill);
  background: var(--surface-muted);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
}

/* Mobile first: the primary action owns a full row, the two secondary ones
   split the next. Before this they were three stacked buttons of three
   different widths, centred, which read as an accident. */
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.spinning {
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

/* The empty state sits inside the section that already names itself, so it
   repeats neither the title nor the icon at hero size. */
.empty-state {
  text-align: center;
  padding: 2rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.empty-icon {
  font-size: 1.75rem;
  color: var(--color-green-500);
  margin-bottom: 0.75rem;
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-ink);
  margin: 0 0 0.35rem;
}

.empty-description {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-muted);
  margin: 0 auto 1.25rem;
  max-width: 22rem;
}

.friends-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* A grid, not a flex row: on mobile the actions used to wrap onto their own
   line while the avatar stayed vertically centred against the whole card,
   leaving a hole beneath it. Here the avatar is pinned to the top row and the
   actions drop under the text they act on. */
.friend-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 0.5rem 0.875rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  transition: box-shadow 0.2s;
}

.friend-card:hover {
  box-shadow: 0 4px 10px rgba(30, 30, 46, 0.09);
}

.friend-avatar {
  grid-column: 1;
  grid-row: 1;
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
  background: var(--color-green-600);
  color: var(--color-white);
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.friend-info {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}

.friend-name {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.15rem;
  color: var(--color-ink);
}

.friend-bio {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin: 0 0 0.35rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  font-size: 0.75rem;
  color: var(--text-faint);
}

.mutual-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.4rem;
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

/* Under the text on mobile, alongside it once there is room. */
.friend-actions {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.action-btn {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

/* Quick sync and full-history sync are the same kind of act — one reaches
   further back — so they share one neutral treatment. Colour is reserved for
   the two things that are not neutral: the destructive one, and the state
   badge. Three buttons wore four colours before this. */
.action-btn.refresh,
.action-btn.sync-all {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.action-btn.refresh:hover:not(:disabled),
.action-btn.sync-all:hover:not(:disabled) {
  background: var(--surface-muted);
  color: var(--color-ink);
}

.action-btn.refresh:disabled,
.action-btn.sync-all:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.remove {
  background: var(--color-red-100);
  color: var(--color-red-800);
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

/* Sized like the action buttons it sits between, so the row keeps one rhythm
   whether a friend is fully synced or still has a button there. The brand
   green, not emerald: "fully synced" and "follows you" are both positive
   states in the same card and were two different greens. */
.fully-synced-badge {
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-green-100);
  color: var(--color-green-700);
  border-radius: var(--radius-sm);
  font-size: 1rem;
}

.block-bar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* From here up it is one column; the width buys back the second row, and the
   title shares it with the actions. */
@media (min-width: 40rem) {
  .block-bar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .actions {
    flex-direction: row;
    justify-content: flex-end;
  }

  .friend-card {
    grid-template-columns: auto 1fr auto;
    align-items: center;
    padding: 1.125rem 1.25rem;
  }

  .friend-actions {
    grid-column: 3;
    grid-row: 1;
  }
}
</style>
