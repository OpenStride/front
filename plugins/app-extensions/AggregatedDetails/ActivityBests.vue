<template>
  <div v-if="bestRows.length > 0" class="bg-white rounded-lg shadow p-4">
    <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
      <i class="fas fa-chart-line text-green-500" aria-hidden="true"></i>
      {{ t('bests.title') }}
    </h3>

    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-gray-600 text-xs uppercase tracking-wide">
            <th class="pb-2 text-left">{{ t('bests.distance') }}</th>
            <th class="pb-2 text-right">{{ t('bests.time') }}</th>
            <th class="pb-2 text-right">
              {{ speedFirst ? t('bests.speed') : t('bests.pace') }}
            </th>
            <th class="pb-2 text-right hidden md:table-cell">
              {{ speedFirst ? t('bests.pace') : t('bests.speed') }}
            </th>
            <th class="pb-2 text-center">{{ t('bests.graph') }}</th>
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
              {{ speedFirst ? row.speedStr : row.paceStr }}
            </td>

            <!-- The secondary of the two, kept for wide screens -->
            <td class="py-2 text-right hidden md:table-cell">
              {{ speedFirst ? row.paceStr : row.speedStr }}
            </td>

            <!-- Lien graphique -->
            <td class="py-2 text-center">
              <RouterLink
                :to="{ path: '/metrics', query: { metric: `time_${row.dist}` } }"
                class="text-green-600 hover:text-green-800 inline-flex items-center gap-1"
              >
                <i class="fas fa-chart-area" aria-hidden="true"></i>
                <span class="sr-only">{{ t('bests.viewProgress') }}</span>
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Activity, ActivityDetails, Sample } from '@/types/activity'
import { usePluginContext } from '@/composables/usePluginContext'
import { formatClock } from '@/utils/duration'
import { getSportProfile } from '@/types/sport'

const { t } = useI18n()

/* ===== Props et constructeur ================================= */
const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const { analyzer: analyzerFactory, units } = usePluginContext()

/**
 * A cyclist reads km/h, a runner min/km. The narrow column is the one that
 * survives on mobile, so it has to be the one the sport actually cares about.
 */
const speedFirst = computed(
  () => getSportProfile(props.data?.activity?.type ?? '').primaryMetric === 'speed'
)
const analyzer = analyzerFactory.create(props.data.details?.samples ?? [])

/* ===== Distances cibles ====================================== */
const targets = [1_000, 2_000, 5_000, 10_000, 15_000, 20_000, 21_097, 30_000, 42_195, 50_000]

/* ===== Helpers de format ===================================== */
// Zero-padded so the column of best times aligns on the colon. Built on the
// shared helper: the `toISOString()` version this replaces wrapped back to
// 00:00:00 past 24 h.
const fmtDuration = (sec: number) => formatClock(sec, { padLeading: true })

/** Takes seconds per metre, like the rest of the app. */
const fmtPace = (secPerMeter: number) =>
  isFinite(secPerMeter) ? units.format('pace', secPerMeter).text : '—'

const fmtSpeed = (mps: number) => (mps ? units.format('speed', mps).text : '—')

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
// A target the activity never reached has no entry at all, so `undefined` is
// part of the shape — the contract says so, this local copy had dropped it.
let bestRaw: Record<
  number,
  { sample: Sample; duration: number; startIdx: number; endIdx: number } | null | undefined
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
      const pace = info.duration / dist // s/m

      return {
        dist,
        distLabel:
          dist >= 1000
            ? units.format('distance', dist).text
            : units.format('distanceShort', dist).text,
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
