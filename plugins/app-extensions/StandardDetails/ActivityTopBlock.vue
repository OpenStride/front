<template>
  <article v-if="activity && details" class="atb">
    <!-- Hero : uniquement s'il y a un tracé. Annoncer "pas de trace GPS" sur une
         nage en bassin, c'est signaler l'absence de ce qui n'a pas lieu d'être. -->
    <div v-if="polyline.length" class="atb__hero">
      <MapPreview class="atb__map" :polyline="polyline" :canzoom="true" theme="osm" />
    </div>

    <div class="atb__body">
      <!-- Entête : badge sport + intitulé + titre + date -->
      <header class="atb__head">
        <div class="atb__badge">
          <i :class="iconClass" aria-hidden="true"></i>
        </div>
        <div class="atb__headtext">
          <div class="atb__kicker">{{ formatSportType(activity.type) }}</div>
          <h1 class="atb__title">{{ activity.title || formatSportType(activity.type) }}</h1>
          <div v-if="formattedDate" class="atb__date">{{ formattedDate }}</div>
        </div>
      </header>

      <!-- Bloc « encre » : les 4 métriques principales (allure surlignée) -->
      <div class="atb__block">
        <div
          v-for="stat in primaryStats"
          :key="stat.label"
          class="atb__cell"
          :class="{ 'atb__cell--hi': stat.highlight }"
        >
          <span class="atb__clabel">{{ stat.label }}</span>
          <span class="atb__cvalue" :class="primaryScale">
            {{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small>
          </span>
        </div>
      </div>

      <!-- Métriques secondaires en dessous (masquées si absentes) -->
      <div v-if="secondaryStats.length" class="atb__substats">
        <div v-for="stat in secondaryStats" :key="stat.label" class="atb__substat">
          <span class="atb__label">{{ stat.label }}</span>
          <span class="atb__subvalue" :class="secondaryScale">
            {{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small>
          </span>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import MapPreview from '@/components/MapPreview.vue'
import { Activity, ActivityDetails } from '@/types/activity'
import { formatSportType, getSportIcon } from '@/utils/sportLabels'
import { distanceDimension, primaryMetricSpec } from '@/utils/activityMetrics'
import { usePluginContext } from '@/composables/usePluginContext'

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()
const { t } = useI18n()

const activity = computed(() => props.data.activity)
const details = computed(() => props.data.details)

const polyline = computed<[number, number][]>(() => {
  // Build from samples (full local activities)
  if (details.value?.samples?.length) {
    return details.value.samples
      .filter(s => typeof s.lat === 'number' && typeof s.lng === 'number')
      .map(s => [s.lat, s.lng] as [number, number])
  }
  // Fallback to mapPolyline (friend activities or minimal data)
  return activity.value?.mapPolyline ?? []
})

const iconClass = computed(() => getSportIcon(activity.value.type))

// ── Formatters ──────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')

const { units, analyzer: analyzerFactory } = usePluginContext()

/**
 * Metres descended.
 *
 * Providers that report it win; for everyone else — every activity stored
 * before this existed, and Strava — it is recomputed from the elevation
 * samples, noise-filtered.
 */
const totalDescent = computed<number | undefined>(() => {
  const reported = details.value?.stats?.totalDescent
  if (reported != null) return reported
  const samples = details.value?.samples
  if (!samples?.length) return undefined
  const { descent } = analyzerFactory.create(samples).elevationChange()
  return descent > 0 ? descent : undefined
})

const formatDistance = (meters?: number) =>
  units.format(distanceDimension(activity.value.type), meters ?? 0)

const formatDuration = (seconds?: number) => {
  const s = Math.max(0, Math.round(seconds ?? 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/**
 * Which quantity to headline is `primaryMetricSpec`'s call, shared with the card.
 * Null when the sport has none — a strength session has no pace to print.
 */
const formatPrimary = (metersPerSecond?: number) => {
  const spec = primaryMetricSpec(activity.value.type, {
    speed: metersPerSecond,
    distance: activity.value.distance,
    duration: activity.value.duration,
    // The detail page has the ascent, so a hike headlines its climb here even
    // though the feed card cannot.
    ascent: details.value?.stats?.totalAscent
  })
  return spec ? { ...units.format(spec.dimension, spec.si), dimension: spec.dimension } : null
}

/** The accent slot's label follows the quantity actually shown there. */
const primaryLabel = (dimension: string) => {
  if (dimension === 'speed') return t('activityDetail.avgSpeed', 'Avg speed')
  if (dimension === 'elevation') return t('activityDetail.elevation', 'Elevation +')
  return t('activityDetail.avgPace', 'Avg pace')
}

const formatThousands = (n?: number) =>
  Math.round(n ?? 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const formattedDate = computed(() => {
  const ts = activity.value?.startTime
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  return `${weekday} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

// ── Metric models ───────────────────────────────────────────
type Stat = { label: string; value: string; unit: string; highlight?: boolean }

/**
 * Long readings step the type down instead of spilling out of their cell.
 *
 * A paired value doubles the digits — an ultra reads "4280/4315 m" where a park
 * run reads "120 m" — and abbreviating it to "4.3k" would drop metres that
 * runners quote exactly. The step is decided by the longest value of the block
 * and applied to all of it: sizing each cell on its own content made a row of
 * numbers that are read together sit at three different sizes.
 */
function scaleFor(stats: Stat[]): string {
  const longest = stats.reduce((max, stat) => Math.max(max, stat.value.length), 0)
  if (longest >= 11) return 'is-xlong'
  if (longest >= 8) return 'is-long'
  return ''
}

const primaryStats = computed<Stat[]>(() => {
  const s = details.value?.stats
  const primary = formatPrimary(s?.averageSpeed)
  const out: Stat[] = []

  // A strength session covers no ground; "0.00 km" is noise, not information.
  if ((activity.value.distance ?? 0) > 0) {
    const distance = formatDistance(activity.value.distance)
    out.push({
      label: t('activityDetail.distance', 'Distance'),
      value: distance.value,
      unit: distance.unit
    })
  }

  if (primary) {
    // The "metric of the moment": a pace for a run, a speed for a ride, the
    // climb for a hike — highlighted in lime.
    out.push({
      label: primaryLabel(primary.dimension),
      value: primary.value,
      unit: primary.unit,
      highlight: true
    })
  }

  out.push({
    label: t('activityDetail.time', 'Time'),
    value: formatDuration(activity.value.duration),
    unit: ''
  })

  // With no pace or speed to headline, the effort worth reading is the energy
  // spent — so calories take the accent slot rather than sit in the second row.
  if (!primary && s?.calories != null) {
    out.push({
      label: t('activityDetail.calories', 'Calories'),
      value: formatThousands(s.calories),
      unit: 'kcal',
      highlight: true
    })
  }

  // Climbed and descended read as one quantity — and as two cells they left an
  // odd number in a two-column grid, so the last one sat alone on its row.
  // Ascent is dropped from the pair when it is already the headline (a hike).
  const ascent =
    s?.totalAscent != null && primary?.dimension !== 'elevation'
      ? units.format('elevation', s.totalAscent)
      : null
  // The twin of the ascent, and the number a skier actually reads — a day on
  // the slopes climbs almost nothing and descends thousands of metres.
  const descent = totalDescent.value != null ? units.format('elevation', totalDescent.value) : null

  const elevation = pairStat(
    ascent && { label: t('activityDetail.elevation', 'Elevation +'), ...ascent },
    descent && { label: t('activityDetail.elevationDown', 'Elevation -'), ...descent },
    t('activityDetail.elevationUpDown', 'Elev. +/-')
  )
  if (elevation) out.push(elevation)

  return out
})

/**
 * Two readings of the same quantity in one cell: "148 / 172 bpm".
 *
 * Splitting them across two cells made the grid odd-numbered — the last metric
 * ended up alone on its row — and separated numbers that are read together.
 * With only one of the two available it keeps that one's own label, so nothing
 * ever prints "148 / —".
 */
function pairStat(
  first: (Stat & { unit: string }) | null | undefined | false,
  second: (Stat & { unit: string }) | null | undefined | false,
  pairedLabel: string
): Stat | null {
  if (first && second) {
    // No spaces around the slash: "320 / 318" wrapped mid-pair in the ink
    // block, splitting two numbers that only mean something together.
    return { label: pairedLabel, value: `${first.value}/${second.value}`, unit: second.unit }
  }
  return first || second || null
}

const primaryScale = computed(() => scaleFor(primaryStats.value))
const secondaryScale = computed(() => scaleFor(secondaryStats.value))

const secondaryStats = computed<Stat[]>(() => {
  const s = details.value?.stats
  const out: Stat[] = []
  const heartRate = pairStat(
    s?.averageHeartRate != null && {
      label: t('activityDetail.avgHr', 'Avg HR'),
      value: Math.round(s.averageHeartRate).toString(),
      unit: 'bpm'
    },
    s?.maxHeartRate != null && {
      label: t('activityDetail.maxHr', 'Max HR'),
      value: Math.round(s.maxHeartRate).toString(),
      unit: 'bpm'
    },
    t('activityDetail.hrAvgMax', 'HR avg/max')
  )
  if (heartRate) out.push(heartRate)
  if (s?.averageCadence != null)
    out.push({
      label: t('activityDetail.cadence', 'Cadence'),
      value: Math.round(s.averageCadence).toString(),
      unit: 'spm'
    })
  // Omitted when the primary block already headlines it (see primaryStats).
  if (s?.calories != null && formatPrimary(s?.averageSpeed))
    out.push({
      label: t('activityDetail.calories', 'Calories'),
      value: formatThousands(s.calories),
      unit: 'kcal'
    })
  // Stored by every provider, displayed nowhere until now.
  if (s?.maxSpeed != null) {
    const max = units.format('speed', s.maxSpeed)
    out.push({ label: t('activityDetail.maxSpeed', 'Max speed'), value: max.value, unit: max.unit })
  }
  return out
})
</script>

<style scoped>
.atb {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-2xl);
  overflow: hidden;
  box-shadow: var(--shadow-float);
  color: var(--color-ink);
}

/* ── Hero ─────────────────────────────────────────── */
.atb__hero {
  position: relative;
  height: 260px;
  /* Contain the map z-indexes so they never rise above the sticky header */
  isolation: isolate;
}
.atb__map {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
}

/* ── Body ─────────────────────────────────────────── */
.atb__body {
  padding: 20px 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.atb__head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.atb__badge {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-green-50);
  border: 1px solid var(--color-green-200);
  display: grid;
  place-items: center;
  color: var(--color-green-700);
  font-size: 20px;
}
.atb__headtext {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.atb__kicker {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-green-600);
}
.atb__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(22px, 4vw, 30px);
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1.08;
  color: var(--color-ink);
}
.atb__date {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-faint);
}

/* ── Bloc « encre » : 4 métriques principales ─────── */
.atb__block {
  background: var(--color-ink);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  display: grid;
  /* Two columns, never three: auto-fit picked whatever fitted, so four metrics
     landed as 3 + 1 and the last one sat alone. Four go two by two, and the
     fourth column only appears when there is room for all of them. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 18px;
}
@media (min-width: 700px) {
  .atb__block {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.atb__cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.atb__clabel {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}
.atb__cvalue {
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--color-white);
}
.atb__cvalue.is-long {
  font-size: 24px;
}
.atb__cvalue.is-xlong {
  font-size: 20px;
}
/* Two columns on a 360px screen leave ~135px per cell: an ultra's "4280/4315"
   does not fit at any of the sizes above. */
@media (max-width: 380px) {
  .atb__cvalue {
    font-size: 26px;
  }
  .atb__cvalue.is-long {
    font-size: 20px;
  }
  .atb__cvalue.is-xlong {
    font-size: 17px;
  }
}
.atb__cvalue small {
  font-size: 13px;
  font-weight: 500;
  margin-left: 4px;
  color: rgba(255, 255, 255, 0.5);
}
.atb__cell--hi .atb__clabel {
  color: var(--color-lime-soft);
}
.atb__cell--hi .atb__cvalue,
.atb__cell--hi .atb__cvalue small {
  color: var(--color-lime);
}

/* ── Secondary stats ──────────────────────────────── */
.atb__substats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (min-width: 700px) {
  .atb__substats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
.atb__substat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
}
.atb__label {
  font-family: var(--font-condensed);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.atb__subvalue {
  font-family: var(--font-mono);
  font-size: 18px;
  font-weight: 500;
  color: var(--color-ink);
}
.atb__subvalue.is-long {
  font-size: 16px;
}
.atb__subvalue.is-xlong {
  font-size: 14px;
}
.atb__subvalue small {
  font-size: 12px;
  margin-left: 3px;
  color: var(--text-faint);
}
</style>
