<template>
  <div class="home-page">
    <!-- Welcome Landing for new users -->
    <WelcomeLanding v-if="showWelcomeLanding" />

    <!-- Activity Feed for existing users -->
    <template v-else>
      <!-- Stats Summary -->
      <div v-if="!loading && counts.total > 0" class="stats-bar">
        <div class="stat-item">
          <span class="stat-label">Mes activités</span>
          <span class="stat-value">{{ counts.own }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Amis</span>
          <span class="stat-value">{{ counts.friends }}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">Total</span>
          <span class="stat-value">{{ counts.total }}</span>
        </div>
      </div>

      <!-- Activities Feed -->
      <div ref="scrollArea" class="feed-container">
        <ActivityCard
          v-for="activity in activities"
          :key="activity.id"
          :activity="activity"
          :friend-username="activity.source === 'friend' ? activity.friendUsername : undefined"
        />

        <p v-if="loading" class="loading-text">Chargement...</p>
        <p v-if="!hasMore && !loading && activities.length > 0" class="end-text">
          Toutes les activités sont chargées
        </p>

        <!-- Empty State for users who had activities before -->
        <div v-if="!loading && activities.length === 0 && hasHadActivities" class="empty-state">
          <div class="empty-icon">
            <i class="fas fa-person-running" aria-hidden="true"></i>
          </div>
          <h3 class="empty-title">Aucune activité</h3>
          <p class="empty-description">
            Connectez un fournisseur de données ou ajoutez des amis pour voir des activités ici
          </p>
          <div class="empty-actions">
            <button @click="navigateToDataProviders" class="action-btn primary">
              Configurer les données
            </button>
            <button @click="navigateToFriends" class="action-btn secondary">
              Ajouter des amis
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import ActivityCard from '@/components/ActivityCard.vue';
import WelcomeLanding from '@/components/WelcomeLanding.vue';
import { useMixedFeed } from '@/composables/useMixedFeed';
import { IndexedDBService } from '@/services/IndexedDBService';

const router = useRouter();
const { activities, loading, hasMore, loadMore, reload, counts } = useMixedFeed();

const scrollArea = ref<HTMLElement | null>(null);
const hasHadActivities = ref(false);

// Show welcome landing only for brand new users (never had any activities)
const showWelcomeLanding = computed(() => {
  return !loading.value && counts.value.total === 0 && !hasHadActivities.value;
});

onMounted(async () => {
  // Check if user has ever had activities
  const db = await IndexedDBService.getInstance();
  const hasSeenActivities = await db.getData('hasSeenActivities');
  hasHadActivities.value = hasSeenActivities === true;

  loadMore();

  // If user now has activities, mark them as having seen activities
  if (counts.value.total > 0 && !hasHadActivities.value) {
    await db.saveData('hasSeenActivities', true);
    hasHadActivities.value = true;
  }

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

const navigateToDataProviders = () => {
  router.push('/data-providers');
};

const navigateToFriends = () => {
  router.push('/friends');
};
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
  background: white;
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
  color: #6b7280;
  font-weight: 500;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}

.stat-divider {
  width: 1px;
  height: 2.5rem;
  background: #e5e7eb;
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

.action-btn.secondary {
  background: #f3f4f6;
  color: #374151;
}

.action-btn.secondary:hover {
  background: #e5e7eb;
}

@media (max-width: 640px) {
  .home-page {
    padding: 0;
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
