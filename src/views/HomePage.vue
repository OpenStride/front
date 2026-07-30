<template>
  <div class="home-page">
    <!-- Stats Summary -->
    <div v-if="!loading && counts.total > 0" class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">{{ t('activities.myActivities') }}</span>
        <span class="stat-value">{{ counts.own }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">{{ t('activities.friends') }}</span>
        <span class="stat-value">{{ counts.friends }}</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item">
        <span class="stat-label">{{ t('activities.total') }}</span>
        <span class="stat-value">{{ counts.total }}</span>
      </div>
    </div>

    <!-- Android only, and only once the app has proven useful -->
    <InstallPrompt variant="banner" />

    <!-- Activities Feed -->
    <div ref="scrollArea" class="feed-container">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
        :friend-username="activity.source === 'friend' ? activity.friendUsername : undefined"
      />

      <p v-if="loading" class="loading-text">{{ t('activities.loading') }}</p>
      <p v-if="!hasMore && !loading && activities.length > 0" class="end-text">
        {{ t('activities.allLoaded') }}
      </p>

      <!-- Empty State -->
      <ActivityEmptyState
        v-if="!loading && activities.length === 0"
        :title="t('activities.noActivity')"
        :description="t('activities.noActivityDescription')"
        show-friends
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import ActivityEmptyState from '@/components/ActivityEmptyState.vue'
import InstallPrompt from '@/components/InstallPrompt.vue'
import { useMixedFeed } from '@/composables/useMixedFeed'
import { useFeedMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { debounce } from '@/utils/debounce'

const { t } = useI18n()
const { activities, loading, hasMore, loadMore, reload, counts } = useMixedFeed()

// Lifts calories, climb and the rest out of the details of the page on screen,
// so the cards can show what only the details hold.
useFeedMetricsIndex(activities)

const scrollArea = ref<HTMLElement | null>(null)

// A single refresh is answered by every service that listens, so the events
// arrive in a burst — reload once for the whole burst.
const onRefresh = debounce(() => {
  reload()
}, 500)

onMounted(() => {
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
</script>

<style scoped>
.home-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 0;
}

.stats-bar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: var(--color-white);
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 0.5rem;
  gap: 0.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--color-gray-500);
  font-weight: 500;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-gray-900);
}

.stat-divider {
  width: 1px;
  height: 2.5rem;
  background: var(--color-gray-200);
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

@media (max-width: 640px) {
  .home-page {
    padding: 0;
  }

  .stats-bar {
    border-radius: 0;
    margin-bottom: 0;
  }
}
</style>
