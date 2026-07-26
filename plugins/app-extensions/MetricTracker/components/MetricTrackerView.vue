<template>
  <div class="tracker-page">
    <h2 class="tracker-title">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      {{ t('metricTracker.title') }}
    </h2>

    <!-- Standalone route: it owns the query string, its own sport filter, and
         the card the panel no longer draws for itself -->
    <div class="tracker-card">
      <MetricTrackerPanel sync-url />
    </div>
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

.tracker-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 1.2rem 1.4rem;
}
</style>
