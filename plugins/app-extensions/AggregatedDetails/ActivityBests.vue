<template>
  <div v-if="bestRows.length > 0" class="bg-white rounded-lg shadow p-4">
    <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
      <i class="fas fa-chart-line text-green-500" aria-hidden="true"></i>
      Bests de la séance
    </h3>

    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-gray-600 text-xs uppercase tracking-wide">
            <th class="pb-2 text-left">Distance</th>
            <th class="pb-2 text-right">Temps</th>
            <th class="pb-2 text-right">Allure</th>
            <th class="pb-2 text-right hidden md:table-cell">Vitesse</th>
            <th class="pb-2 text-center">Graph</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in bestRows"
            :key="row.dist"
            class="group even:bg-gray-50 hover:bg-green-50 transition-colors"
          >
            <!-- Badge distance -->
            <td class="py-2">
              <span
                class="inline-block rounded-full px-3 py-0.5 text-xs font-medium text-white"
                :style="{ backgroundColor: badgeColor(row.dist) }"
              >
                {{ row.distLabel }}
              </span>
            </td>

            <!-- Temps & allure -->
            <td class="py-2 text-right tabular-nums font-medium">
              {{ row.timeStr }}
            </td>
            <td class="py-2 text-right tabular-nums">
              {{ row.paceStr }}
            </td>

            <!-- Vitesse -->
            <td class="py-2 text-right hidden md:table-cell">
              {{ row.speedStr }}
            </td>

            <!-- Lien graphique -->
            <td class="py-2 text-center">
              <RouterLink
                :to="`/history/${row.dist}`"
                class="text-green-600 hover:text-green-800 inline-flex items-center gap-1"
              >
                <i class="fas fa-chart-area" aria-hidden="true"></i>
                <span class="sr-only">Voir le graphique</span>
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Activity, ActivityDetails, Sample } from '@/types/activity'
import { usePluginContext } from '@/composables/usePluginContext'

/* ===== Props et constructeur ================================= */
const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const { analyzer: analyzerFactory } = usePluginContext()
const analyzer = analyzerFactory.create(props.data.details?.samples ?? [])

/* ===== Distances cibles ====================================== */
const targets = [1_000, 2_000, 5_000, 10_000, 15_000, 20_000, 21_097, 30_000, 42_195, 50_000]

/* ===== Helpers de format ===================================== */
const fmtDuration = (sec: number) =>
  isFinite(sec) ? new Date(sec * 1000).toISOString().substring(sec >= 3600 ? 11 : 14, 19) : '—'

const fmtPace = (secPerKm: number) =>
  isFinite(secPerKm)
    ? `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`
    : '—'

const fmtSpeed = (mps: number) => (mps ? (mps * 3.6).toFixed(1) + ' km/h' : '—')

/* ===== Badge couleur selon distance ========================== */
function badgeColor(d: number): string {
  const s = getComputedStyle(document.documentElement)
  if (d <= 2_000) return s.getPropertyValue('--color-cyan-500').trim() || '#00bbd3'
  if (d <= 10_000) return s.getPropertyValue('--color-green-500').trim() || '#88aa00'
  if (d <= 21_097) return s.getPropertyValue('--color-orange-400').trim() || '#f49268'
  return s.getPropertyValue('--color-orange-700').trim() || '#b75e38'
}

/* ===== Calcul & filtrage ===================================== */
const totalDistance = props.data.activity.distance ?? 0

// Handle case where samples are empty or invalid
let bestRaw: Record<
  number,
  { sample: Sample; duration: number; startIdx: number; endIdx: number } | null
> = {}
try {
  bestRaw = analyzer.bestSegments(targets)
} catch (error) {
  console.warn('[ActivityBests] Cannot compute best segments:', error)
}

const bestRows = computed(() =>
  targets
    .filter(dist => dist <= totalDistance) // masque distances non atteintes
    .filter(dist => bestRaw[dist] !== null && bestRaw[dist] !== undefined) // Filter out null results
    .map(dist => {
      const info = bestRaw[dist]!
      const pace = info.duration / (dist / 1000)

      return {
        dist,
        distLabel:
          dist >= 1000 ? (dist / 1000).toFixed(dist >= 10_000 ? 0 : 1) + ' km' : dist + ' m',
        timeStr: fmtDuration(info.duration),
        paceStr: fmtPace(pace),
        speedStr: fmtSpeed(info.sample.speed ?? 0)
      }
    })
)
</script>

<style scoped>
/* Désactive la ligne décorative “focus” sur RouterLink (Chromium) */
a:focus-visible {
  outline-offset: 2px;
}
</style>
