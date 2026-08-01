<template>
  <div class="tracker-page">
    <h2 class="tracker-title">
      <i class="fas fa-chart-line" aria-hidden="true"></i>
      {{ t('metricTracker.title') }}
    </h2>

    <!-- Standalone route: it owns the query string, its own sport filter, and
         the card the panel no longer draws for itself -->
    <div class="section-card">
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

/* Même traitement que la page statistiques : la carte prend toute la largeur
   sur mobile, seul le titre garde une marge. */
@media (max-width: 640px) {
  .tracker-page {
    padding-left: 0;
    padding-right: 0;
  }

  .tracker-title {
    padding: 0 1rem;
  }
}
</style>
