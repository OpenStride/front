<template>
  <div class="friends-page">
    <!-- Header with actions -->
    <div class="page-header">
      <h2 class="page-title">{{ t('friends.title') }}</h2>
      <button @click="openScanner" class="add-btn icon-only" title="Ajouter un ami">
        <i class="fas fa-user-plus" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Stats bar -->
    <div v-if="!loading && count > 0" class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">{{ t('friends.activities') }}</span>
        <span class="stat-value">{{ count }}</span>
      </div>
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
    <QRScanner
      :is-open="scannerOpen"
      @close="scannerOpen = false"
      @friend-added="onFriendAdded"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import ActivityCard from '@/components/ActivityCard.vue';
import QRScanner from '@/components/QRScanner.vue';
import { useFriendsFeed } from '@/composables/useFriendsFeed';

const router = useRouter();
const { t } = useI18n();
const { activities, loading, hasMore, loadMore, reload, count } = useFriendsFeed();

const scrollArea = ref<HTMLElement | null>(null);
const scannerOpen = ref(false);

onMounted(async () => {
  loadMore();

  window.addEventListener('scroll', handleScroll);
  window.addEventListener('openstride:activities-refreshed', onRefresh);
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll);
  window.removeEventListener('openstride:activities-refreshed', onRefresh);
});

const handleScroll = () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
  if (bottom) {
    loadMore();
  }
};

const onRefresh = async () => {
  await reload();
};

const openScanner = () => {
  scannerOpen.value = true;
};

const onFriendAdded = async () => {
  await reload();
};

const navigateToManageFriends = () => {
  router.push('/profile?tab=friends');
};
</script>

<style scoped>
.friends-page {
  max-width: 600px;
  margin: 0 auto;
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 1rem;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
  gap: 1rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  color: #111827;
}

.add-btn {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.5rem;
  background: var(--color-green-500);
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.add-btn:hover {
  background: var(--color-green-600);
}

.add-btn i {
  font-size: 1rem;
}

.stats-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  background: white;
  padding: 1rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 0.5rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 500;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
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
  color: #6b7280;
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
  color: #111827;
  margin: 0 0 0.5rem;
}

.empty-description {
  color: #6b7280;
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
  color: white;
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

  .page-title {
    font-size: 1.25rem;
  }

  .stats-bar {
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
