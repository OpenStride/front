<template>
  <div class="activity-details">
    <div v-if="loading">{{ t('common.loading') }}</div>
    <div v-else-if="activity">
      <!-- Friend activity banner -->
      <div v-if="isFriendActivity" class="friend-banner">
        <i class="fas fa-user-friends" aria-hidden="true"></i>
        <span
          >{{ t('activityDetailPage.friendActivity') }} <strong>{{ friendUsername }}</strong></span
        >
      </div>

      <div class="top-container">
        <component
          v-for="(comp, i) in topSlotComponents"
          :is="comp"
          :key="`top-${i}`"
          :data="activityData"
        />
      </div>

      <!-- Widgets Section (full width) -->
      <div class="widgets-container">
        <component
          v-for="(comp, i) in widgetSlotComponents"
          :is="comp"
          :key="`widget-${i}`"
          :data="activityData"
          class="w-full"
        />
      </div>
      <!-- End of Widgets Section -->
    </div>
    <div v-else>
      <p>{{ t('activityDetailPage.notFound') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, defineComponent, h, onMounted, provide } from 'vue'
import { useSlotExtensions } from '@/composables/useSlotExtensions'
import { useActivityDetails } from '@/composables/useActivityDetails'
import { ACTIVITY_PANEL_FOOTER, type SlotContext } from '@/types/extension'
import InteractionList from '@/components/InteractionList.vue'

const { t } = useI18n()

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

// Widgets decide for themselves whether they have anything to show, so they
// need the activity — which only lands after the slot's initial resolution.
const slotContext = () => activityData.value as SlotContext

const { components: widgetSlotComponentsRaw } = useSlotExtensions('activity.widgets', slotContext)
const { components: topSlotComponentsRaw } = useSlotExtensions('activity.top', slotContext)

const widgetSlotComponents = computed(() => widgetSlotComponentsRaw.value)
const topSlotComponents = computed(() => topSlotComponentsRaw.value)

// Like, comment, who liked: under the tiles of the first panel, which the
// extension drawing that panel renders where it closes
provide(
  ACTIVITY_PANEL_FOOTER,
  defineComponent({
    name: 'ActivityInteractions',
    setup: () => () =>
      canShowInteractions.value
        ? h(InteractionList, {
            activityId: interactionActivityId.value,
            activityOwnerId: interactionOwnerId.value!,
            isMutualFriend: isMutualFriend.value
          })
        : null
  })
)

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
