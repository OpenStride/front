<template>
  <article v-if="activity && details" class="atb">
    <!-- Hero : tracé GPS (ou placeholder grille) -->
    <div class="atb__hero">
      <MapPreview
        v-if="polyline.length"
        class="atb__map"
        :polyline="polyline"
        :canzoom="true"
        theme="osm"
      />
      <div v-else class="atb__map atb__map--empty">
        <i class="fas fa-map-location-dot" aria-hidden="true"></i>
        <span>{{ t('activityDetail.noRoute', 'No GPS route') }}</span>
      </div>
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
          <span class="atb__cvalue">
            {{ stat.value }}<small v-if="stat.unit">{{ stat.unit }}</small>
          </span>
        </div>
      </div>

      <!-- Métriques secondaires en dessous (masquées si absentes) -->
      <div v-if="secondaryStats.length" class="atb__substats">
        <div v-for="stat in secondaryStats" :key="stat.label" class="atb__substat">
          <span class="atb__label">{{ stat.label }}</span>
          <span class="atb__subvalue">
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

const formatDistance = (meters?: number) => ((meters ?? 0) / 1000).toFixed(2)

const formatDuration = (seconds?: number) => {
  const s = Math.max(0, Math.round(seconds ?? 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** m/s → { value: "5'24", unit: "/km" } */
const formatPace = (metersPerSecond?: number): { value: string; unit: string } => {
  if (!metersPerSecond || metersPerSecond <= 0) return { value: '—', unit: '' }
  const paceMinPerKm = 1000 / metersPerSecond / 60
  const min = Math.floor(paceMinPerKm)
  const sec = Math.round((paceMinPerKm - min) * 60)
  return { value: `${min}'${pad(sec)}`, unit: '/km' }
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

const primaryStats = computed<Stat[]>(() => {
  const s = details.value?.stats
  const pace = formatPace(s?.averageSpeed)
  const out: Stat[] = [
    {
      label: t('activityDetail.distance', 'Distance'),
      value: formatDistance(activity.value.distance),
      unit: 'km'
    },
    {
      // The pace is the "metric of the moment" for a run → highlighted in lime
      label: t('activityDetail.avgPace', 'Avg pace'),
      value: pace.value,
      unit: pace.unit,
      highlight: true
    },
    {
      label: t('activityDetail.time', 'Time'),
      value: formatDuration(activity.value.duration),
      unit: ''
    }
  ]
  if (s?.totalAscent != null) {
    out.push({
      label: t('activityDetail.elevation', 'Elevation +'),
      value: Math.round(s.totalAscent).toString(),
      unit: 'm'
    })
  }
  return out
})

const secondaryStats = computed<Stat[]>(() => {
  const s = details.value?.stats
  const out: Stat[] = []
  if (s?.averageHeartRate != null)
    out.push({
      label: t('activityDetail.avgHr', 'Avg HR'),
      value: Math.round(s.averageHeartRate).toString(),
      unit: 'bpm'
    })
  if (s?.averageCadence != null)
    out.push({
      label: t('activityDetail.cadence', 'Cadence'),
      value: Math.round(s.averageCadence).toString(),
      unit: 'spm'
    })
  if (s?.calories != null)
    out.push({
      label: t('activityDetail.calories', 'Calories'),
      value: formatThousands(s.calories),
      unit: 'kcal'
    })
  if (s?.maxHeartRate != null)
    out.push({
      label: t('activityDetail.maxHr', 'Max HR'),
      value: Math.round(s.maxHeartRate).toString(),
      unit: 'bpm'
    })
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
.atb__map--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-faint);
  font-family: var(--font-condensed);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 13px;
  background: var(--surface-muted);
  background-image: repeating-linear-gradient(
      0deg,
      rgba(30, 30, 46, 0.05) 0 1px,
      transparent 1px 40px
    ),
    repeating-linear-gradient(90deg, rgba(30, 30, 46, 0.05) 0 1px, transparent 1px 40px);
}
.atb__map--empty i {
  font-size: 22px;
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
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 20px 18px;
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
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
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
.atb__subvalue small {
  font-size: 12px;
  margin-left: 3px;
  color: var(--text-faint);
}
</style>
