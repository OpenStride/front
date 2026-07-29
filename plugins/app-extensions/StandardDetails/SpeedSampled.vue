<template>
  <GraphCard :title="graphTitle" icon="fa-gauge-high" accent="var(--color-green-500)">
    <template #actions>
      <!-- Masque la case si on est en mode “laps” -->
      <label v-if="slopeGranularity !== 'laps' && showSlope" class="graph-check">
        <input
          type="checkbox"
          v-model="useSlope"
          @change="onUseSlopeChange"
          class="accent-green"
        />{{ t('graphs.slopeVariation') }}
      </label>
      <select v-model="slopeGranularity" @change="onGranularityChange" class="graph-select">
        <option v-for="option in granularities" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </template>
    <canvas ref="canvas" width="800" height="400"></canvas>
    <div
      v-if="tooltip.visible"
      :style="tooltip.style"
      class="fixed z-50 bg-white text-sm shadow px-3 py-2 rounded border border-gray-200 transition-opacity duration-150"
    >
      <div>
        <strong>{{ t('graphs.distance') }} :</strong> {{ tooltip.distance.toFixed(2) }} m
      </div>
      <div>
        <strong>{{ t('graphs.speed') }} :</strong> {{ tooltip.pace }} {{ paceUnit }}
      </div>
      <div v-if="showSlope && tooltip.slope !== null">
        <strong>{{ tooltip.slopeLabel }}</strong
        >({{ tooltip.slope.toFixed(1) }}%)
      </div>
    </div>

    <!-- ===== Tableau récapitulatif ===== -->
    <div class="mt-6">
      <div class="flex text-xs sm:text-sm font-semibold border-b pb-1 mb-1">
        <span class="w-16">{{ t('graphs.colDistance') }}</span>
        <span class="flex-1">{{ graphTitle }}</span>
        <span class="w-10 text-right">{{ paceUnit }}</span>
        <span class="w-12 text-right">{{ t('graphs.colHeartRate') }}</span>
        <span v-if="showSlope" class="w-20 text-right">{{ t('graphs.colSlope') }}</span>
      </div>

      <div v-for="(s, i) in samples" :key="i" class="flex items-center py-1 text-xs sm:text-sm">
        <!-- Distance cumulée -->
        <span class="w-16">{{ segmentDistance(s, i).toFixed(0) }} m</span>

        <!-- Barre horizontale représ. la pace -->
        <div class="flex-1 h-3 bg-gray-100 rounded mx-1 overflow-hidden">
          <div class="h-full bg-green-500 rounded" :style="{ width: paceBarWidth(s) + '%' }" />
        </div>

        <!-- Pace numérique -->
        <span class="w-10 text-right">{{ paceStr(s) }}</span>

        <!-- FC moyenne -->
        <span class="w-12 text-right">
          {{ hrAvg(s) ?? '—' }}
        </span>

        <!-- Icône pente + % -->
        <span v-if="showSlope" class="w-20 text-right">
          <template v-if="s.slope != null">
            <span class="inline-block w-4 text-center">{{ slopeIcon(s) }}</span>
            <span class="ml-1">{{ s.slope.toFixed(1) }} %</span>
          </template>
          <span v-else class="text-gray-400">—</span>
        </span>
      </div>
    </div>
  </GraphCard>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, watch, onMounted, ref, onBeforeUnmount } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'
import { getSportProfile } from '@/types/sport'
import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import type { SegmentSample } from '@/services/ActivityAnalyzer'
import GraphCard from './GraphCard.vue'

const { t } = useI18n()

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()

const { storage, analyzer: analyzerFactory, units } = usePluginContext()

/**
 * Cyclists read km/h, runners read min/km. The sport's profile decides which,
 * exactly as it does for the card and the summary block — a ride was showing a
 * pace graph titled "Pace" while its own card headlined a speed.
 */
const showsSpeed = computed(
  () => getSportProfile(props.data.activity?.type ?? '').primaryMetric === 'speed'
)

/** Unit shown on the axis and in the tooltip: "km/h", "/km", "/mi"… */
const paceUnit = computed(() =>
  showsSpeed.value ? units.convert('speed', 1).unit : units.convert('pace', 1).unit
)

const graphTitle = computed(() =>
  showsSpeed.value ? t('graphs.speed') : t('graphs.pace')
)

/** m/s → the number plotted on the Y axis, in the user's units. */
const toAxis = (metersPerSecond: number) =>
  showsSpeed.value
    ? units.convert('speed', metersPerSecond).value
    : units.convert('pace', metersPerSecond > 0 ? 1 / metersPerSecond : 0).value

/** Axis labels: "24.8" for a speed, "4:32" for a pace. */
const axisLabel = (value: number) => {
  if (showsSpeed.value) return value.toFixed(value < 20 ? 1 : 0)
  const total = Math.round(value)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const canvas = ref<HTMLCanvasElement | null>(null)
const samples = ref<SegmentSample[]>([])
// A road run on flat ground has nothing to say about grade, and a column of
// "0.1 %" is noise. Decided from the terrain, never from the sport label: a
// watch that files a trail as a run must not hide the climbing.
const showSlope = ref(true)
// Left plot margin, computed each draw from the widest axis label; shared with
// the tooltip hit-testing so a click still maps to the right distance.
const leftMargin = ref(50)

const useSlope = ref(false)
const slopeGranularity = ref('1000')

/**
 * Smoothing steps that are round in the unit being read.
 *
 * Values stay in metres so the analyser and stored preference are unchanged;
 * only the ladder offered differs, because "0.62 mi" is not a step anyone picks.
 */
const granularities = computed(() =>
  units.system === 'imperial'
    ? [
        { label: '100 yd', value: '91' },
        { label: '200 yd', value: '183' },
        { label: '¼ mi', value: '402' },
        { label: '½ mi', value: '805' },
        { label: '1 mi', value: '1609' },
        { label: '3 mi', value: '4828' },
        { label: 'Laps', value: 'laps' }
      ]
    : [
        { label: '100 m', value: '100' },
        { label: '200 m', value: '200' },
        { label: '500 m', value: '500' },
        { label: '1 km', value: '1000' },
        { label: '2 km', value: '2000' },
        { label: '5 km', value: '5000' },
        { label: 'Laps', value: 'laps' }
      ]
)

/** A stored step from the other ladder would leave the select blank. */
function snapToOffered(stored: string): string {
  const offered = granularities.value.map(g => g.value)
  if (offered.includes(stored)) return stored
  if (stored === 'laps') return 'laps'
  const meters = Number(stored)
  if (!Number.isFinite(meters)) return offered[3]
  return offered
    .filter(v => v !== 'laps')
    .reduce((best, v) =>
      Math.abs(Number(v) - meters) < Math.abs(Number(best) - meters) ? v : best
    )
}


async function savePreferences() {
  await storage.saveData('granularity_for_speed', slopeGranularity.value)
  await storage.saveData('use_slope_for_speed', useSlope.value)
}

async function loadPreferences() {
  const storedGranularity = await storage.getData('granularity_for_speed')
  const storedUseSlope = await storage.getData('use_slope_for_speed')
  if (typeof storedGranularity === 'string')
    slopeGranularity.value = snapToOffered(storedGranularity)
  if (typeof storedUseSlope === 'boolean') useSlope.value = storedUseSlope
}

function onGranularityChange() {
  savePreferences()
  resample()
}

function onUseSlopeChange() {
  savePreferences()
  resample()
}

async function resample() {
  const analyzer = analyzerFactory.create(props.data.details.samples ?? [])
  showSlope.value = !analyzer.elevationProfile().isFlat
  if (slopeGranularity.value === 'laps') {
    samples.value = analyzer.sampleByLaps(props.data.details.laps ?? [])
  } else if (useSlope.value) {
    samples.value = analyzer.sampleBySlopeChange(parseInt(slopeGranularity.value))
  } else {
    samples.value = analyzer.sampleAverageByDistance(parseInt(slopeGranularity.value))
  }
  drawCanvas()
}

function getColorFromSpeed(speed: number, min: number, max: number): string {
  const ratio = (speed - min) / (max - min || 1)
  const lightness = 75 - ratio * 40 // même dégradé L
  const alpha = 0.8 // transparence douce
  return `hsla(75, 70%, ${lightness}%, ${alpha})`
}

function drawCanvas() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx || samples.value.length === 0) return

  // Responsive: size the backing store to the actual display size (× DPR for
  // crispness) and draw in CSS pixels, so the chart holds at any width / zoom.
  const dpr = window.devicePixelRatio || 1
  const width = el.clientWidth || 800
  // Height follows the width (~2:1) instead of a fixed value, so the chart keeps
  // a pleasant aspect on narrow/mobile widths instead of looking stretched.
  const height = Math.round(Math.min(360, Math.max(200, width * 0.52)))
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  el.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const axisFont = '12px sans-serif'
  ctx.font = axisFont

  // Left margin sized to fit the widest "mm:ss" pace label so the bars never
  // cover the units. Shared with the tooltip via leftMargin.
  const pxMargin = Math.max(
    44,
    Math.ceil(ctx.measureText(showsSpeed.value ? '88.8' : '88:88').width) + 16
  )
  leftMargin.value = pxMargin
  ctx.clearRect(0, 0, width, height)

  const speeds = samples.value.map(s => s.speed ?? 0)
  let minSpeed = Math.min(...speeds)
  let maxSpeed = Math.max(...speeds)

  const treshold = 0.1 * (maxSpeed - minSpeed || 1)
  minSpeed = Math.max(minSpeed - treshold, 0)
  maxSpeed = Math.max(maxSpeed + treshold, minSpeed + 0.1)

  const totalDistance = props.data.activity?.distance // samples.value[samples.value.length - 1]?.distance ?? 1

  const plotTop = 30
  const plotHeight = height - 50
  const baseline = plotTop + plotHeight

  // === Grille et axes ===
  ctx.strokeStyle = cssVar('--color-gray-200', '#e5e7eb')
  ctx.lineWidth = 1
  ctx.font = axisFont
  ctx.fillStyle = cssVar('--color-gray-400', '#9ca3af')

  // Axis values, in whatever this chart plots. `axisLow` is the value drawn at
  // the top: the fastest pace, or the highest speed.
  const axisLow = toAxis(maxSpeed)
  const axisHigh = toAxis(minSpeed)

  // Aim for ~6 gridlines whatever the spread. A fixed 30 s pace step drew
  // twenty overlapping labels on a hike, whose pace ranges over nine minutes.
  const spread = Math.abs(axisHigh - axisLow) || 1
  const STEP = showsSpeed.value
    ? Math.max(1, Math.round(spread / 6))
    : ([15, 30, 60, 120, 300, 600].find(step => spread / step <= 7) ?? 900)
  const lo = Math.min(axisLow, axisHigh)
  const hi = Math.max(axisLow, axisHigh)
  const firstTick = Math.floor(lo / STEP) * STEP - STEP
  const lastTick = Math.ceil(hi / STEP) * STEP + STEP

  ctx.strokeStyle = cssVar('--color-gray-200', '#e5e7eb')
  ctx.lineWidth = 1
  ctx.font = axisFont
  ctx.fillStyle = cssVar('--color-gray-400', '#9ca3af')

  for (let tick = firstTick; tick <= lastTick; tick += STEP) {
    const y = plotTop + ((tick - axisLow) / (axisHigh - axisLow || 1)) * plotHeight
    if (y < plotTop - 1 || y > baseline + 1) continue
    ctx.beginPath()
    ctx.moveTo(pxMargin, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    ctx.fillText(axisLabel(tick), 5, y + 4)
  }

  // === Repères verticaux distance (max 10) ===
  // Ticks are spaced in the unit being read, so an imperial user gets round
  // miles rather than round kilometres relabelled.
  const totalDisplay = units.convert('distance', totalDistance).value
  const maxTicks = 10

  /* 1) pas brut */
  const rawStep = totalDisplay / maxTicks // ex. 2.7 km

  /* 2) arrondi à 1 ·10ⁿ, 2 ·10ⁿ ou 5 ·10ⁿ  -------------------- */
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep))) // 10ⁿ
  const niceBase = [1, 2, 5].find(b => b * mag >= rawStep) || 10
  const stepDisplay = niceBase * mag // ex. 5 km

  /* 3) tracé des traits --------------------------------------- */
  ctx.strokeStyle = cssVar('--color-gray-200', '#e5e7eb')
  ctx.lineWidth = 1

  const metersPerDisplayUnit = 1 / units.convert('distance', 1).value
  for (let d = stepDisplay; d < totalDisplay; d += stepDisplay) {
    const x = pxMargin + ((d * metersPerDisplayUnit) / totalDistance) * (width - pxMargin)
    ctx.beginPath()
    ctx.moveTo(x, plotTop)
    ctx.lineTo(x, baseline)
    ctx.stroke()
  }

  // === Altitude ==================================================
  const rawSamples = (props.data.details.samples ?? [])
    .filter((_, idx) => idx % 5 === 0) // 1/5 des points
    .filter(s => s.elevation != null)
  const elevations = rawSamples.map(s => s.elevation).filter((e): e is number => e != null)
  const minElev = Math.min(...elevations)
  const maxElev = Math.max(...elevations)
  const elevRange = maxElev - minElev || 1 // éviter /0
  const padRatio = 0.1 // 10 %
  const flatThresh = 5 // ≤5 m = « plat »

  let minVisElev: number
  let maxVisElev: number

  if (elevRange <= flatThresh) {
    // — Trace plate : on garde seulement un coussin en haut (10 %)
    minVisElev = minElev
    maxVisElev = maxElev + elevRange * padRatio
  } else {
    // — Trace vallonnée : coussin haut + bas (10 % chacun)
    minVisElev = minElev - elevRange * padRatio
    maxVisElev = maxElev + elevRange * padRatio
  }

  const visRange = maxVisElev - minVisElev

  ctx.beginPath()
  ctx.strokeStyle = cssVar('--color-gray-400', '#9ca3af')
  ctx.lineWidth = 1

  let x = pxMargin
  for (let i = 0; i < rawSamples.length; i++) {
    const s = rawSamples[i]
    const dist = s.distance ?? 0
    const elev = s.elevation ?? 0

    x = pxMargin + (dist / totalDistance) * (width - pxMargin)

    // projection verticale
    const y = baseline - ((elev - minVisElev) / visRange) * plotHeight

    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  ctx.lineTo(x, baseline)
  ctx.lineTo(pxMargin, baseline)
  ctx.fillStyle = cssVar('--color-gray-100', '#f3f4f6')
  ctx.fill()

  // === Barres vitesse ===
  for (let i = 0; i < samples.value.length; i++) {
    const s = samples.value[i]
    const d0 = i === 0 ? 0 : (samples.value[i - 1]?.distance ?? 0)
    const d1 = s.distance ?? 0
    const xStart = pxMargin + (d0 / totalDistance) * (width - pxMargin)
    const widthPx = ((d1 - d0) / totalDistance) * (width - pxMargin)
    const speed = s.speed ?? 0
    const value = speed > 0 ? toAxis(speed) : axisHigh
    const heightPx = ((axisHigh - value) / (axisHigh - axisLow || 1)) * plotHeight
    //const heightPx = ((speed - minSpeed) / (maxSpeed - minSpeed || 1)) * plotHeight
    ctx.fillStyle = getColorFromSpeed(speed, minSpeed, maxSpeed)
    ctx.fillRect(xStart, baseline - heightPx, widthPx - 1, heightPx)
  }
}

const tooltip = ref({
  visible: false,
  style: {},
  speed: 0,
  pace: '',
  distance: 0,
  // null when the track has no elevation for this segment — a missing grade is
  // not a flat one
  slope: null as number | null,
  slopeLabel: ''
})

let tooltipTimeout: ReturnType<typeof setTimeout> | null = null

function classifySlopeValue(value: number): string {
  if (value > 0.1) return 'Montée'
  if (value < -0.1) return 'Descente'
  return 'Plat'
}

function showTooltip(event: MouseEvent | TouchEvent) {
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY

  const rect = canvas.value!.getBoundingClientRect()
  const x = clientX - rect.left
  const width = rect.width
  const totalDistance = props.data.activity?.distance

  const pxMargin = leftMargin.value

  const relativeX = (x - pxMargin) / (width - pxMargin)
  const clickedDistance = relativeX * totalDistance

  // Trouver le sample le plus proche
  let index = samples.value.findIndex((s, i) => {
    const prev = samples.value[i - 1]
    return (prev?.distance ?? 0) <= clickedDistance && (s.distance ?? 0) >= clickedDistance
  })

  if (index === -1) index = samples.value.length - 1

  const s = samples.value[index]
  if (!s) return

  // Whatever the chart plots, shown in the user's units.
  const speedMps = s.speed ?? 0
  const paceStr = axisLabel(toAxis(speedMps))

  const speed = speedMps ?? 0
  const slope = s.slope ?? null

  tooltip.value = {
    visible: true,
    style: {
      left: `${clientX + 10}px`,
      top: `${clientY + 10}px`
    },
    distance: segmentDistance(s, index),
    speed,
    pace: paceStr,
    slope,
    slopeLabel: slope === null ? '' : classifySlopeValue(slope)
  }

  if (tooltipTimeout) clearTimeout(tooltipTimeout)
  tooltipTimeout = setTimeout(() => {
    tooltip.value.visible = false
  }, 2000)
}

/* ---------- helpers pour le tableau ---------- */
function paceSec(sample: Sample) {
  return (sample.speed ?? 0) > 0 ? 1000 / (sample.speed as number) : Infinity
}
/**
 * The row's headline figure, in whatever this chart plots.
 *
 * It has to agree with the column header, which carries `paceUnit`: a ski
 * listing "1:38" under a "km/h" heading is worse than either alone.
 */
function paceStr(sample: Sample) {
  const speed = sample.speed ?? 0
  if (!isFinite(speed) || speed <= 0) return '—'
  return axisLabel(toAxis(speed))
}
/* largeur relative : plus la pace est rapide, plus la barre est longue  */
function paceBarWidth(sample: Sample) {
  const pace = paceSec(sample)
  if (!isFinite(pace)) return 0

  const all = samples.value.map(paceSec).filter(isFinite)
  const localMin = Math.min(...all)
  const localMax = Math.max(...all)
  const threshold = 0.1 * (localMax - localMin || 1) // 10 %
  const baselineMin = localMin - threshold // plus rapide encore
  const baselineMax = localMax // plus lent

  /* largeur entre 5 % et 100 % pour rester visible */
  const ratio = (baselineMax - pace) / (baselineMax - baselineMin || 1)
  return Math.max(5, ratio * 100)
}
function slopeIcon(sample: SegmentSample) {
  const s = sample.slope
  if (s == null) return '—'
  if (s > 0.5) return '↗︎'
  if (s < -0.5) return '↘︎'
  return '→'
}

function hrAvg(sample: Sample) {
  return sample.heartRate != null ? Math.round(sample.heartRate) : null
}

/* distance du segment (m) */
function segmentDistance(sample: SegmentSample, i = samples.value.indexOf(sample)) {
  // The analyzer measures the span from raw samples; differencing the averaged
  // `distance` of two segments misses half of each of them
  if (sample.segmentDistance != null) return sample.segmentDistance
  if (i <= 0) return sample.distance ?? 0
  return (sample.distance ?? 0) - (samples.value[i - 1].distance ?? 0)
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await loadPreferences()
  await resample()

  canvas.value?.addEventListener('click', showTooltip)
  canvas.value?.addEventListener('touchstart', showTooltip)

  // Redraw when the container width changes (window resize / browser zoom)
  resizeObserver = new ResizeObserver(() => drawCanvas())
  if (canvas.value) resizeObserver.observe(canvas.value)
})

onBeforeUnmount(() => {
  canvas.value?.removeEventListener('click', showTooltip)
  canvas.value?.removeEventListener('touchstart', showTooltip)
  resizeObserver?.disconnect()
  resizeObserver = null
})

// Canvas content sits outside Vue's reactivity: switching units has to redraw.
watch(
  () => units.system,
  () => drawCanvas()
)
</script>

<style scoped>
canvas {
  max-width: 100%;
}

.accent-green {
  accent-color: var(--color-green-500);
}

.graph-check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.graph-select {
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  color: var(--text-color);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}
</style>
