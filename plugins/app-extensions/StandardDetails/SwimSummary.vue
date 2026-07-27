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
import type { Activity, ActivityDetails } from '@/types/activity'

const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const { t } = useI18n()
const { units } = usePluginContext()

/** Rows to show, in reading order. Anything absent is simply skipped. */
const ROWS = [
  { key: 'swim.poolLength', label: 'swimSummary.poolLength', fallback: 'Pool' },
  { key: 'swim.lengths', label: 'swimSummary.lengths', fallback: 'Lengths' },
  { key: 'swim.swolf', label: 'swimSummary.swolf', fallback: 'SWOLF' },
  { key: 'swim.strokes', label: 'swimSummary.strokes', fallback: 'Strokes' },
  { key: 'swim.strokeRate', label: 'swimSummary.strokeRate', fallback: 'Stroke rate' }
] as const

const items = computed(() => {
  const measurements = props.data.details?.measurements ?? {}

  return ROWS.flatMap(row => {
    const m = measurements[row.key]
    if (!m) return []

    // Pool length is a real distance and follows the unit preference; counts,
    // SWOLF and stroke rate mean the same thing in both systems.
    const formatted =
      row.key === 'swim.poolLength'
        ? units.format('distanceShort', m.value)
        : { value: Math.round(m.value).toString(), unit: '' }

    return [
      {
        key: row.key,
        label: t(row.label, row.fallback),
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
