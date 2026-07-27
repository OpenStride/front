<template>
  <div class="friends-page">
    <!-- Header with actions -->
    <div class="page-header">
      <h2 class="page-title">
        {{ t('friends.title') }}
        <span v-if="!loading && count > 0" class="count">{{ count }}</span>
      </h2>

      <!-- One slim row for everything the page can do. Showing your own code,
           adding someone and managing the list were spread across an icon with
           no label, a profile tab and an empty state that disappeared as soon as
           you had a friend. -->
      <nav class="quick-actions" :aria-label="t('friends.actions')">
        <button @click="qrOpen = true" class="chip" data-test="open-my-qr">
          <i class="fas fa-qrcode" aria-hidden="true"></i>
          {{ t('friends.quickQr') }}
        </button>
        <button @click="openScanner" class="chip primary" data-test="open-scanner">
          <i class="fas fa-user-plus" aria-hidden="true"></i>
          {{ t('friends.quickAdd') }}
        </button>
        <router-link to="/profile?tab=friends" class="chip" data-test="manage-friends">
          <i class="fas fa-users-gear" aria-hidden="true"></i>
          {{ t('friends.quickManage') }}
        </router-link>
      </nav>
    </div>

    <!-- Activities Feed -->
    <div ref="scrollArea" class="feed-container">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
        :friend-username="activity.friendUsername"
      />

      <p v-if="loading" class="loading-text">{{ t('activities.loading') }}</p>
      <p v-if="!hasMore && !loading && activities.length > 0" class="end-text">
        {{ t('activities.allLoaded') }}
      </p>

      <!-- Empty State -->
      <div v-if="!loading && activities.length === 0" class="empty-state">
        <div class="empty-icon">
          <i class="fas fa-user-friends" aria-hidden="true"></i>
        </div>
        <h3 class="empty-title">{{ t('friends.noActivities') }}</h3>
        <p class="empty-description">
          {{ t('friends.noActivitiesDescription') }}
        </p>
        <div class="empty-actions">
          <button @click="navigateToManageFriends" class="action-btn primary">
            {{ t('friends.manageFriends') }}
          </button>
        </div>
      </div>
    </div>

    <!-- QR Scanner Modal -->
    <!-- Scanning navigates to /add-friend for confirmation; nothing to reload here -->
    <QRScanner :is-open="scannerOpen" @close="scannerOpen = false" />

    <MyQrCodeModal :is-open="qrOpen" @close="qrOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import QRScanner from '@/components/QRScanner.vue'
import MyQrCodeModal from '@/components/MyQrCodeModal.vue'
import { useFriendsFeed } from '@/composables/useFriendsFeed'

const router = useRouter()
const { t } = useI18n()
const { activities, loading, hasMore, loadMore, reload, count } = useFriendsFeed()

const scrollArea = ref<HTMLElement | null>(null)
const scannerOpen = ref(false)
const qrOpen = ref(false)

onMounted(async () => {
  loadMore()

  window.addEventListener('scroll', handleScroll)
  window.addEventListener('openstride:activities-refreshed', onRefresh)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('openstride:activities-refreshed', onRefresh)
})

const handleScroll = () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100
  if (bottom) {
    loadMore()
  }
}

const onRefresh = async () => {
  await reload()
}

const openScanner = () => {
  scannerOpen.value = true
}

const navigateToManageFriends = () => {
  router.push('/profile?tab=friends')
}
</script>

<style scoped>
.friends-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 0;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 1rem;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-color);
}

.count {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--surface-2);
  border-radius: var(--radius-pill);
  padding: 0.1rem 0.5rem;
}

/* Slim by design: one line of chips, scrolled sideways rather than stacked when
   a translation makes them too wide for a narrow phone */
.quick-actions {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  scrollbar-width: none;
}

.quick-actions::-webkit-scrollbar {
  display: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text-color);
  font-size: 0.8rem;
  font-weight: 600;
  /* Global button styling uppercases labels; the third chip is a link, so
     without this the row read "MON QR / AJOUTER / Gérer" */
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.2s;
}

.chip:hover {
  background: var(--surface-muted);
}

.chip.primary {
  background: var(--color-green-500);
  border-color: var(--color-green-500);
  color: var(--color-white);
}

.chip.primary:hover {
  background: var(--color-green-600);
}

.feed-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.loading-text,
.end-text {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--color-gray-500);
  font-size: 0.875rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  min-height: 60vh;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  color: var(--color-green-500);
}

.empty-icon i {
  font-size: 4rem;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-gray-900);
  margin: 0 0 0.5rem;
}

.empty-description {
  color: var(--color-gray-500);
  margin: 0 0 2rem;
  max-width: 400px;
}

.empty-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.action-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--color-green-500);
  color: var(--color-white);
}

.action-btn.primary:hover {
  background: var(--color-green-600);
}

@media (max-width: 640px) {
  .friends-page {
    padding: 0;
  }

  .page-header {
    border-radius: 0;
    margin-bottom: 0;
  }

  .empty-actions {
    flex-direction: column;
    width: 100%;
    max-width: 300px;
  }

  .action-btn {
    width: 100%;
  }
}
</style>
