<template>
  <div class="aggregated-progress-widget">
    <div class="header-row">
      <h3 class="title">Progression</h3>
      <div class="select-row">
        <select :value="selectedPeriod" @change="onPeriodChange">
          <option v-for="period in availablePeriods" :key="period" :value="period">
            {{ periodLabels[period] || period }}
          </option>
        </select>
        <select :value="selectedMetric" @change="onMetricChanged">
          <option v-for="metric in availableBaseMetrics" :key="metric.id" :value="metric.id">
            {{ metric.label }}
          </option>
        </select>
        <button
          class="refresh-btn"
          @click="onRefresh"
          :disabled="refreshing"
          title="Recalculer les agrégats"
        >
          <i v-if="!refreshing" class="fas fa-sync-alt" aria-hidden="true"></i>
          <span v-else>…</span>
        </button>
      </div>
    </div>
    <AggregatedProgressChart :weeks="chartWeeks" :distance="chartDistance" />
    <div class="metrics">
      <div v-for="def in availableMetrics" :key="def.id" class="metric">
        <span class="label">{{ def.label }}</span>
        <span class="value">{{
          format(metricsCache[selectedPeriod]?.find(m => m.def.id === def.id)?.value ?? 0, def)
        }}</span>
        <span v-if="def.displayUnit" class="unit">{{ def.displayUnit }}</span>
        <span v-else-if="def.unit" class="unit">{{ def.unit }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'

const { storage, aggregation: aggregationCtx } = usePluginContext()

// Initialise les métriques distance/durée pour chaque période si manquantes
async function ensureMetricsExist() {
  const metrics = aggregationCtx.listMetrics()
  const required = [
    {
      id: 'distance',
      label: 'Distance',
      sourceRef: 'distance',
      unit: 'm',
      displayUnit: 'km',
      displayFactor: 0.001
    },
    {
      id: 'duration',
      label: 'Durée',
      sourceRef: 'duration',
      unit: 's',
      displayUnit: 'min',
      displayFactor: 1 / 60
    },
    {
      id: 'totalAscent',
      label: 'D+ cumulé',
      sourceRef: 'stats.totalAscent',
      unit: 'm',
      displayUnit: 'm',
      displayFactor: 1
    }
  ]
  const periods: ('week' | 'month' | 'year')[] = ['week', 'month', 'year']
  let changed = false
  for (const base of required) {
    for (const period of periods) {
      const id = `${period}_${base.id}`
      if (!metrics.find(m => m.id === id)) {
        metrics.push({
          id,
          label: `${base.label}`,
          enabled: true,
          sourceRef: base.sourceRef,
          aggregation: 'sum',
          periods: [period],
          unit: base.unit,
          decimals: base.id === 'distance' ? 1 : 0,
          displayUnit: base.displayUnit,
          displayFactor: base.displayFactor
        })
        changed = true
      }
    }
  }
  if (changed) {
    await storage.saveData('aggregationConfig', { metrics })
    await aggregationCtx.loadConfigFromSettings()
    // Récupère toutes les activités et détails pour rebuildAll
    const allActs = await storage.exportDB('activities')
    const allDetails = await storage.exportDB('activity_details')
    const detailsMap = new Map<string, Record<string, unknown> | null>()
    for (const d of allDetails) {
      if (d && (d as Record<string, unknown>).id)
        detailsMap.set((d as Record<string, unknown>).id as string, d as Record<string, unknown>)
    }
    await aggregationCtx.rebuildAll(allActs as Record<string, unknown>[], detailsMap)
  }
}
const selectedPeriod = ref<'week' | 'month' | 'year'>('week')
const selectedMetric = ref<string>('distance')
const periodLabels = { week: 'Hebdomadaire', month: 'Mensuel', year: 'Annuel' }
const availablePeriods = ref<Array<'week' | 'month' | 'year'>>(['week', 'month', 'year'])
const availableBaseMetrics = ref<Array<{ id: string; label: string }>>([])
// Handlers pour les listes déroulantes
function onPeriodChange(e: Event) {
  selectedPeriod.value = (e.target as HTMLSelectElement).value as 'week' | 'month' | 'year'
}

function onMetricChanged(e: Event) {
  selectedMetric.value = (e.target as HTMLSelectElement).value
}
const availableMetrics = ref<AggregationMetricDefinition[]>([])
import AggregatedProgressChart from './AggregatedProgressChart.vue'
import type { AggregationMetricDefinition } from '@/types/aggregation'

const metrics = ref<Array<{ def: AggregationMetricDefinition; value: number }>>([])
const metricsCache = ref<
  Record<string, Array<{ def: AggregationMetricDefinition; value: number }>>
>({})
const refreshing = ref(false)

const chartWeeks = ref<string[]>([])
const chartDistance = ref<number[]>([])

function format(val: number, metric: AggregationMetricDefinition) {
  if (val == null) return '-'
  let displayVal = val
  let unit = metric.unit
  if (metric.displayFactor) displayVal = val * metric.displayFactor
  if (metric.displayUnit) unit = metric.displayUnit
  if (metric.decimals != null) displayVal = Number(displayVal)
  if (unit === 's') return `${Math.round(displayVal / 60)} min`
  return metric.decimals != null ? displayVal.toFixed(metric.decimals) : displayVal
}

// Convertit une clé de mois (ex: 2025-10) en label (ex: 10/2025)
function monthKeyToLabel(monthKey: string): string {
  const match = monthKey.match(/(\d{4})-(\d{2})/)
  if (!match) return monthKey
  return `${match[2]}/${match[1]}`
}

// Convertit une clé de semaine ISO (ex: 2025-W41) en date du lundi (format JJ/MM)
function weekKeyToMonday(weekKey: string): string {
  const match = weekKey.match(/(\d{4})-W(\d{2})/)
  if (!match) return weekKey
  const year = parseInt(match[1], 10)
  const week = parseInt(match[2], 10)
  const simple = new Date(year, 0, 1 + (week - 1) * 7)
  const dow = simple.getDay()
  const monday = new Date(simple)
  if (dow <= 4) {
    monday.setDate(simple.getDate() - simple.getDay() + 1)
  } else {
    monday.setDate(simple.getDate() + 8 - simple.getDay())
  }
  return monday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

async function loadMetrics() {
  // Parse config to get available periods and base metrics
  const allDefs = aggregationCtx.listMetrics().filter(m => m.enabled)
  // Get unique periods
  availablePeriods.value = Array.from(new Set(allDefs.flatMap(m => m.periods)))
  // Get unique base metrics
  const baseMetricMap = new Map<string, { id: string; label: string }>()
  for (const def of allDefs) {
    const parts = def.id.split('_')
    if (parts.length > 1) {
      baseMetricMap.set(parts.slice(1).join('_'), {
        id: parts.slice(1).join('_'),
        label: def.label
      })
    } else {
      baseMetricMap.set(def.id, { id: def.id, label: def.label })
    }
  }
  availableBaseMetrics.value = Array.from(baseMetricMap.values())

  // Build the selected metric key
  const metricKey = `${selectedPeriod.value}_${selectedMetric.value}`
  const defs = allDefs.filter(m => m.periods.includes(selectedPeriod.value))
  availableMetrics.value = defs
  // Utilise le cache si disponible
  if (metricsCache.value[selectedPeriod.value]) {
    metrics.value = metricsCache.value[selectedPeriod.value]
  } else {
    const results = await Promise.all(
      defs.map(async def => {
        const recs = await aggregationCtx.getAggregated(def.id, selectedPeriod.value)
        // Prendre la dernière période (max periodKey)
        const latest = recs.sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0]
        return {
          def,
          value: latest?.value ?? 0
        }
      })
    )
    metrics.value = results
    metricsCache.value[selectedPeriod.value] = results
  }

  // Préparer les données pour le graphe selon la métrique sélectionnée
  const metricDef = defs.find(d => d.id === metricKey)
  let periods: string[] = []
  let values: number[] = []
  if (metricDef) {
    const recs = await aggregationCtx.getAggregated(metricDef.id, selectedPeriod.value)
    // Trie par période décroissante et ne garde que les 5 dernières
    const sorted = recs
      .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
      .slice(0, 5)
      .reverse()
    if (selectedPeriod.value === 'week') {
      periods = sorted.map(r => weekKeyToMonday(r.periodKey))
    } else if (selectedPeriod.value === 'month') {
      periods = sorted.map(r => monthKeyToLabel(r.periodKey))
    } else {
      periods = sorted.map(r => r.periodKey)
    }
    values = sorted.map(r =>
      metricDef.displayFactor ? r.value * metricDef.displayFactor : r.value
    )
  }
  chartWeeks.value = periods
  chartDistance.value = values
}

// Recharge les données quand la sélection change
watch([selectedPeriod, selectedMetric], loadMetrics)

onMounted(async () => {
  await ensureMetricsExist()
  await loadMetrics()
})

const onRefresh = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const allActs = await storage.exportDB('activities')
    const allDetails = await storage.exportDB('activity_details')
    const detailsMap = new Map<string, Record<string, unknown> | null>()
    for (const d of allDetails) {
      if (d && (d as Record<string, unknown>).id)
        detailsMap.set((d as Record<string, unknown>).id as string, d as Record<string, unknown>)
    }
    await aggregationCtx.rebuildAll(allActs as Record<string, unknown>[], detailsMap)
    // Vide le cache et recharge les métriques
    metricsCache.value = {}
    await loadMetrics()
  } catch {
    /* Optionally show error */
  }
  refreshing.value = false
}
</script>

<style scoped>
.aggregated-progress-widget {
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.7rem;
  }
  .refresh-btn {
    background: var(--color-gray-100);
    border: none;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 1.1em;
    color: var(--color-emerald-800);
    cursor: pointer;
    transition: background 0.2s;
  }
  .refresh-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 1.2rem 1.4rem;
  margin-bottom: 0.5rem;
}
.title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.7rem;
}
.metrics {
  display: flex;
  gap: 2.2rem;
  flex-wrap: wrap;
}
.metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 90px;
  font-size: 1.05rem;
}
.label {
  color: var(--color-gray-600);
  font-size: 0.98em;
  margin-bottom: 2px;
}
.value {
  font-weight: 700;
  font-size: 1.18em;
  color: var(--color-emerald-800);
}
.unit {
  font-size: 0.95em;
  color: var(--color-gray-400);
  margin-left: 2px;
}
</style>
