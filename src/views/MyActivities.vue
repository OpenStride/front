<template>
  <div class="my-activities">
    <div class="activities-top-container">
      <component v-for="(comp, i) in topSlotComponents" :is="comp" :key="`myacts-top-${i}`" />
    </div>
    <div ref="scrollArea" class="scroll-container">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
      />
      <p v-if="loading">Chargement...</p>
      <p v-if="!hasMore && !loading">Toutes les activités sont chargées.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import ActivityCard from "@/components/ActivityCard.vue";
import { getActivityDBService } from "@/services/ActivityDBService";
import { useSlotExtensions } from '@/composables/useSlotExtensions';
// Refresh logic moved to global header refresh button; no per-view pull-to-refresh anymore.

// Allow plugins to inject aggregated overview widgets
const { components: topRaw } = useSlotExtensions('myactivities.top');
const topSlotComponents = computed(() => topRaw.value.map(c => (c as any).default || c));


const activities = ref<any[]>([]);
const loading = ref(false);
const page = ref(0);
const pageSize = 10;
const hasMore = ref(true);

onMounted(() => {
  loadActivities();
  window.addEventListener("scroll", handleScroll);
  window.addEventListener('openstride:activities-refreshed', softReload);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener('openstride:activities-refreshed', softReload);
});

const handleScroll = () => {
  const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
  if (bottom) loadActivities();
};

const loadActivities = async () => {
  if (loading.value || !hasMore.value) return;
  const activityDB = await getActivityDBService(); 
  loading.value = true;

  const newActivities = await activityDB.getActivities({
    offset: page.value * pageSize,
    limit: pageSize,
  });

  if (newActivities.length < pageSize) {
    hasMore.value = false;
  }

  activities.value.push(...newActivities);
  page.value += 1;
  loading.value = false;
};

// Soft reload after a background refresh: reset pagination and refetch first pages
const softReload = async () => {
  const activityDB = await getActivityDBService();
  const prevLength = activities.value.length;
  activities.value = [];
  page.value = 0;
  hasMore.value = true;
  loading.value = false;
  await loadActivities();
  // Optionally prefetch second page if previously user had many items
  if (prevLength > pageSize) await loadActivities();
};

// Legacy onRefresh (pull-to-refresh) removed. Header button handles refresh & sync.
</script>

<style scoped>
.my-activities {
  max-width: 600px;
  margin: 2rem auto;
}
.my-activities:first-child {
  margin-top: 0;
}
.activities-top-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
</style>
