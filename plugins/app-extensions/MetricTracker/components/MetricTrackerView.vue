<template>
  <div class="tracker-page">
    <h2 class="tracker-title">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      {{ t('metricTracker.title') }}
    </h2>

    <!-- Standalone route: it owns the query string and its own sport filter -->
    <MetricTrackerPanel sync-url />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MetricTrackerPanel from './MetricTrackerPanel.vue'

const { t } = useI18n()
</script>

<style scoped>
.tracker-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

.tracker-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tracker-title i {
  color: var(--color-green-500);
}
</style>
