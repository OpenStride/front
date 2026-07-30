<template>
  <div class="empty-state" data-test="activity-empty-state">
    <div class="empty-icon">
      <i class="fas fa-person-running" aria-hidden="true"></i>
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p class="empty-description">{{ description }}</p>
    <div class="empty-actions">
      <button class="action-btn primary" data-test="empty-configure" @click="goToDataProviders">
        {{ t('activities.configureData') }}
      </button>
      <button
        v-if="showFriends"
        class="action-btn secondary"
        data-test="empty-friends"
        @click="goToFriends"
      >
        {{ t('activities.addFriends') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

/**
 * The screen a list shows when it holds nothing at all.
 *
 * Shared between the feed and the activity list rather than copied: both are
 * reached before any data exists — `/my-activities` is where the router sends a
 * user the moment onboarding completes — and both need to point at the same way
 * out. The friends button is optional: a list of one's own activities is not
 * made less empty by adding a friend.
 */
defineProps<{
  title: string
  description: string
  showFriends?: boolean
}>()

const router = useRouter()
const { t } = useI18n()

const goToDataProviders = () => router.push('/profile?tab=data-sources')
const goToFriends = () => router.push('/friends')
</script>

<style scoped>
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

.action-btn.secondary {
  background: var(--color-gray-100);
  color: var(--color-gray-700);
}

.action-btn.secondary:hover {
  background: var(--color-gray-200);
}

@media (max-width: 640px) {
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
