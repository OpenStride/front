<template>
  <section class="section-card">
    <div class="section-header">
      <h3 class="section-title">
        <i class="fas fa-chart-line" aria-hidden="true"></i>
        {{ t('metricTracker.title') }}
      </h3>
      <RouterLink to="/metrics" class="open-link">
        {{ t('metricTracker.openFullPage') }}
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </RouterLink>
    </div>

    <!-- The statistics page owns the sport filter, so the panel follows it -->
    <MetricTrackerPanel :sport="sport ?? ''" />
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import MetricTrackerPanel from './MetricTrackerPanel.vue'

const { t } = useI18n()

defineProps<{
  /** Sport selected on the host page, empty string for all sports */
  sport?: string
}>()
</script>

<style scoped>
.section-card {
  background: var(--bg-color);
  border: 1px solid var(--color-green-200);
  border-radius: 12px;
  padding: 1.2rem 1.4rem;
}

.section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title i {
  color: var(--color-green-500);
}

.open-link {
  font-size: 0.85rem;
  color: var(--color-green-600);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.open-link:hover {
  color: var(--color-green-700);
}
</style>
