<template>
  <div class="bg-white rounded-lg shadow p-4">
    <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
      <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 17l6-6 4 4 8-8 1 1-9 9-4-4-7 7z"/>
      </svg>
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
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M5 3v18h18v-2H7V3H5zm6 10.5l3-4 4.5 6L23 11v8H11v-5.5z"
                  />
                </svg>
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
import { Activity, ActivityDetails } from '@/types/activity'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'

/* ===== Props et constructeur ================================= */
const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const analyzer = new ActivityAnalyzer(props.data.details.samples ?? [])

/* ===== Distances cibles ====================================== */
const targets = [
  1_000,
  2_000,
  5_000,
  10_000,
  15_000,
  20_000,
  21_097,
  30_000,
  42_195,
  50_000,
]

/* ===== Helpers de format ===================================== */
const fmtDuration = (sec: number) =>
  isFinite(sec)
    ? new Date(sec * 1000).toISOString().substring(sec >= 3600 ? 11 : 14, 19)
    : '—'

const fmtPace = (secPerKm: number) =>
  isFinite(secPerKm)
    ? `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`
    : '—'

const fmtSpeed = (mps: number) => (mps ? (mps * 3.6).toFixed(1) + ' km/h' : '—')

/* ===== Badge couleur selon distance ========================== */
function badgeColor(d: number): string {
  if (d <= 2_000)  return '#00bbd3' // cyan-500
  if (d <= 10_000) return '#88aa00' // emerald-500
  if (d <= 21_097) return '#f49268' // amber-500
  return '#b75e38'                  // rose-500
}

/* ===== Calcul & filtrage ===================================== */
const totalDistance = props.data.activity.distance ?? 0
const bestRaw = analyzer.bestSegments(targets)

const bestRows = computed(() =>
  targets
    .filter(dist => dist <= totalDistance) // masque distances non atteintes
    .map(dist => {
      const info = bestRaw[dist]!
      const pace = info.duration / (dist / 1000)

      return {
        dist,
        distLabel:
          dist >= 1000
            ? (dist / 1000).toFixed(dist >= 10_000 ? 0 : 1) + ' km'
            : dist + ' m',
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
