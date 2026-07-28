<template>
  <GraphCard :title="t('swimSummary.title', 'Swim')" icon="fa-person-swimming">
    <ul class="swim">
      <li v-for="item in items" :key="item.key" class="swim__item">
        <span class="swim__label">{{ item.label }}</span>
        <span class="swim__value">
          {{ item.value }}<small v-if="item.unit">{{ item.unit }}</small>
        </span>
      </li>
    </ul>
  </GraphCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GraphCard from './GraphCard.vue'
import { usePluginContext } from '@/composables/usePluginContext'
import { MEASUREMENTS, measurementKeysFor } from '@/types/measurements'
import { formatMeasurement } from '@/utils/activityMetrics'
import type { Activity, ActivityDetails } from '@/types/activity'

const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const { t } = useI18n()
const { units } = usePluginContext()

/**
 * Rows come from the registry, in its declaration order. The widget holds no
 * opinion about which keys exist or which of them convert — those are
 * properties of the key, stated once in `MEASUREMENTS`. Adding a swim
 * measurement there makes it appear here with no change to this file.
 */
const items = computed(() => {
  const measurements = props.data.details?.measurements ?? {}

  return measurementKeysFor('swim').flatMap(key => {
    const measurement = measurements[key]
    if (!measurement) return []

    const formatted = formatMeasurement(key, measurement, units.format, k => t(k))
    return [
      {
        key,
        label: t(MEASUREMENTS[key].labelKey),
        value: formatted.value,
        unit: formatted.unit
      }
    ]
  })
})
</script>

<style scoped>
.swim {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.swim__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.swim__label {
  font-family: var(--font-condensed);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.swim__value {
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--text-color);
}

.swim__value small {
  font-size: 0.7em;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: 2px;
}
</style>
