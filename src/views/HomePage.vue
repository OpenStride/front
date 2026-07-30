<template>
  <div class="home-page">
    <!-- Blocks that ask for an action rather than report a figure -->
    <div v-if="topSlotComponents.length" class="home-top">
      <component v-for="(comp, i) in topSlotComponents" :is="comp" :key="`home-top-${i}`" />
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import ActivityCard from '@/components/ActivityCard.vue'
import ActivityEmptyState from '@/components/ActivityEmptyState.vue'
import InstallPrompt from '@/components/InstallPrompt.vue'
import { useMixedFeed } from '@/composables/useMixedFeed'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useFeedMetricsIndex } from '@/composables/useActivityMetricsIndex'
import { debounce } from '@/utils/debounce'

const { t } = useI18n()
const { activities, loading, hasMore, loadMore, reload } = useMixedFeed()

const { components: topRaw } = useSlotExtensions('home.top')
const topSlotComponents = computed(() => topRaw.value)

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

.home-top {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
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

  .home-top {
    margin-bottom: 0.75rem;
  }
}
</style>
