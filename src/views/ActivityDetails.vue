<template>
  <div class="activity-details">
    <div v-if="loading">Chargement...</div>
    <div v-else-if="activity">
      <!-- Friend activity banner -->
      <div v-if="isFriendActivity" class="friend-banner">
        <i class="fas fa-user-friends" aria-hidden="true"></i>
        <span
          >Activité de <strong>{{ friendUsername }}</strong></span
        >
      </div>

      <div class="top-container">
        <component
          v-for="(comp, i) in topSlotComponents"
          :is="comp?.default || comp"
          :key="`top-${i}`"
          :data="activityData"
        />
      </div>

      <!-- Widgets Section (full width) -->
      <div class="widgets-container">
        <component
          v-for="(comp, i) in widgetSlotComponents"
          :is="comp?.default || comp"
          :key="`widget-${i}`"
          :data="activityData"
          class="w-full"
        />
      </div>
      <!-- End of Widgets Section -->

      <!-- Interactions Section (friend and own activities) -->
      <InteractionList
        v-if="canShowInteractions"
        :activity-id="interactionActivityId"
        :activity-owner-id="interactionOwnerId!"
        :is-mutual-friend="isMutualFriend"
      />
    </div>
    <div v-else>
      <p>Activité introuvable.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useActivityDetails } from '@/composables/useActivityDetails'
import InteractionList from '@/components/InteractionList.vue'

const { components: widgetSlotComponentsRaw } = useSlotExtensions('activity.widgets')
const { components: topSlotComponentsRaw } = useSlotExtensions('activity.top')

const widgetSlotComponents = computed(() =>
  widgetSlotComponentsRaw.value.map(c => (c as { default?: unknown }).default || c)
)
const topSlotComponents = computed(() =>
  topSlotComponentsRaw.value.map(c => (c as { default?: unknown }).default || c)
)

const {
  activity,
  loading,
  isFriendActivity,
  friendUsername,
  canShowInteractions,
  interactionActivityId,
  interactionOwnerId,
  isMutualFriend,
  activityData,
  loadActivity
} = useActivityDetails()

onMounted(loadActivity)
</script>

<style scoped>
.activity-details {
  padding: 0 0 1.5rem 0;
}

.friend-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, var(--color-green-500) 0%, var(--color-green-600) 100%);
  color: var(--color-white);
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
}

.friend-banner i {
  font-size: 1.1rem;
}

.map-preview {
  width: 100%;
  height: 240px;
  margin-top: 1rem;
}

.top-container {
  display: flex;
  flex-direction: column;
}

.widgets-container {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.widgets-container :deep(.rounded-lg) {
  border-radius: 0 !important;
}
</style>
