<template>
  <GraphCard :title="t('graphs.cadence')" icon="fa-shoe-prints" accent="var(--color-cyan-500)">
    <template #actions>
      <!-- Case à cocher “Variation de pente” : masquée si on affiche les laps -->
      <label v-if="granularity !== 'laps'" class="graph-check">
        <input type="checkbox" v-model="useSlope" @change="onUseSlopeChange" class="accent-cyan" />
        {{ t('graphs.slopeVariation') }}
      </label>

      <!-- Sélecteur de granularité -->
      <select v-model="granularity" @change="onGranularityChange" class="graph-select">
        <option v-for="opt in granularities" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </template>

    <!-- ===== Graphique ===== -->
    <canvas ref="canvas" width="800" height="400"></canvas>

    <!-- ===== Infobulle ===== -->
    <div
      v-if="tooltip.visible"
      :style="tooltip.style"
      class="fixed z-50 bg-white text-sm shadow px-3 py-2 rounded border border-gray-200 transition-opacity duration-150"
    >
      <div>
        <strong>{{ t('graphs.distance') }} :</strong> {{ tooltip.distance.toFixed(0) }} m
      </div>
      <div>
        <strong>{{ t('graphs.cadence') }} :</strong> {{ tooltip.cadence }} pas/min
      </div>
      <div v-if="tooltip.slope !== null">
        <strong>{{ t('graphs.slope') }} :</strong> {{ tooltip.slope.toFixed(1) }} %
      </div>
    </div>
  </GraphCard>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, watch, ref, onMounted, onBeforeUnmount } from 'vue'
import { usePluginContext } from '@/composables/usePluginContext'
import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import GraphCard from './GraphCard.vue'

const { t } = useI18n()

const cssVar = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/* ===== Props ===== */
const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

const { storage, analyzer: analyzerFactory, units } = usePluginContext()

/* ===== Références & états ===== */
const canvas = ref<HTMLCanvasElement | null>(null)
const samples = ref<Sample[]>([])
// Left plot margin, computed each draw from the widest axis label; shared with
// the tooltip hit-testing so a click still maps to the right distance.
const leftMargin = ref(50)
const granularity = ref('1000') // distance (m) ou 'laps'
const useSlope = ref(false) // mode variation de pente

/* ===== Options de granularité ===== */
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


/* ===== Persistance (PluginContext) ===== */
async function savePrefs() {
  await storage.saveData('granularity_for_cadence', granularity.value)
  await storage.saveData('use_slope_for_cadence', useSlope.value)
}
async function loadPrefs() {
  const g = await storage.getData('granularity_for_cadence')
  const s = await storage.getData('use_slope_for_cadence')
  if (typeof g === 'string') granularity.value = snapToOffered(g)
  if (typeof s === 'boolean') useSlope.value = s
}

/* ===== Re-échantillonnage ===== */
async function resample() {
  const analyzer = analyzerFactory.create(props.data.details.samples ?? [])
  if (granularity.value === 'laps') {
    samples.value = analyzer.sampleByLaps(props.data.details.laps ?? [])
  } else if (useSlope.value) {
    samples.value = analyzer.sampleBySlopeChange(Number(granularity.value))
  } else {
    samples.value = analyzer.sampleAverageByDistance(Number(granularity.value))
  }
  drawCanvas()
}

/* ===== Couleur des barres ===== */
function getColorFromCadence(c: number, min: number, max: number): string {
  const hue = 186 // cyan
  const sat = 80 // %
  const t = (c - min) / (max - min || 1) // 0 → 1
  const light = 65 - t * 35 // 65 % (lent) → 30 % (rapide)
  const alpha = 0.7 // transparence douce
  return `hsla(${hue} ${sat}% ${light}% / ${alpha})`
}

/* ===== Dessin du graphique ===== */
function drawCanvas() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx || samples.value.length === 0) return

  // Responsive: size the backing store to the actual display size (× DPR for
  // crispness) and draw in CSS pixels, so the chart holds at any width / zoom.
  const dpr = window.devicePixelRatio || 1
  const W = el.clientWidth || 800
  // Height follows the width (~2:1) instead of a fixed value, so the chart keeps
  // a pleasant aspect on narrow/mobile widths instead of looking stretched.
  const H = Math.round(Math.min(360, Math.max(200, W * 0.52)))
  el.width = Math.round(W * dpr)
  el.height = Math.round(H * dpr)
  el.style.height = `${H}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)

  const axisFont = '12px sans-serif'

  /* === Cadence min / max === */
  const cadences = samples.value.map(s => s.cadence ?? 0)
  let minC = Math.min(...cadences)
  let maxC = Math.max(...cadences)
  const thr = 0.1 * (maxC - minC || 1)
  minC = Math.max(minC - thr, 0)
  maxC += thr

  /* === Layout === */
  // Left margin sized to fit the widest cadence label so bars never cover it.
  ctx.font = axisFont
  const pxMargin = Math.max(40, Math.ceil(ctx.measureText('888').width) + 16)
  leftMargin.value = pxMargin
  const plotTop = 30
  const plotHeight = H - 50
  const baseline = plotTop + plotHeight
  const totalDist = props.data.activity.distance || 1

  /* === Grille horizontale (cadence) === */
  ctx.strokeStyle = cssVar('--color-gray-200', '#e5e7eb')
  ctx.fillStyle = cssVar('--color-gray-400', '#9ca3af')
  ctx.font = axisFont
  for (let c = Math.floor(minC / 10) * 10; c <= maxC + 10; c += 10) {
    const y = plotTop + ((c - minC) / (maxC - minC || 1)) * plotHeight
    ctx.beginPath()
    ctx.moveTo(pxMargin, y)
    ctx.lineTo(W, y)
    ctx.stroke()
    ctx.fillText(`${c}`, 8, y + 4)
  }

  /* === Grille verticale (distance) === */
  // Ticks in the unit being read, not kilometres relabelled.
  const totalDisplay = units.convert('distance', totalDist).value
  const rawStep = totalDisplay / 10
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const niceBase = [1, 2, 5].find(b => b * mag >= rawStep) || 10
  const stepDisplay = niceBase * mag
  const metersPerDisplayUnit = 1 / units.convert('distance', 1).value
  for (let d = stepDisplay; d < totalDisplay; d += stepDisplay) {
    const x = pxMargin + ((d * metersPerDisplayUnit) / totalDist) * (W - pxMargin)
    ctx.beginPath()
    ctx.moveTo(x, plotTop)
    ctx.lineTo(x, baseline)
    ctx.stroke()
  }

  /* === Profil altitude (gris) === */
  const raw = (props.data.details.samples ?? [])
    .filter((_, i) => i % 5 === 0)
    .filter(s => s.elevation != null)
  const elevs = raw.map(s => s.elevation as number)
  const minE = Math.min(...elevs)
  const maxE = Math.max(...elevs)
  const padE = (maxE - minE || 1) * 0.1
  const minVE = minE - padE
  const maxVE = maxE + padE
  const rangeE = maxVE - minVE || 1

  ctx.beginPath()
  ctx.strokeStyle = cssVar('--color-gray-400', '#9ca3af')
  ctx.lineWidth = 1
  let xCur = pxMargin
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i].distance ?? 0
    const e = raw[i].elevation ?? 0
    xCur = pxMargin + (d / totalDist) * (W - pxMargin)
    const y = baseline - ((e - minVE) / rangeE) * plotHeight
    if (i === 0) {
      ctx.moveTo(xCur, y)
    } else {
      ctx.lineTo(xCur, y)
    }
  }
  ctx.stroke()
  ctx.lineTo(xCur, baseline)
  ctx.lineTo(pxMargin, baseline)
  ctx.fillStyle = cssVar('--color-gray-100', '#f3f4f6')
  ctx.fill()

  /* === Barres de cadence === */
  for (let i = 0; i < samples.value.length; i++) {
    const s = samples.value[i]
    const d0 = i === 0 ? 0 : (samples.value[i - 1].distance ?? 0)
    const d1 = s.distance ?? 0
    const xStart = pxMargin + (d0 / totalDist) * (W - pxMargin)
    const wPx = ((d1 - d0) / totalDist) * (W - pxMargin)
    const c = s.cadence ?? 0
    ctx.fillStyle = ctx.fillStyle = getColorFromCadence(c, minC, maxC)
    const hPx = ((c - minC) / (maxC - minC || 1)) * plotHeight
    ctx.fillRect(xStart, baseline - hPx, wPx - 1, hPx)
  }
}

/* ===== Tooltip ===== */
const tooltip = ref({
  visible: false,
  style: {},
  distance: 0,
  cadence: 0,
  slope: null as number | null
})
let hideTT: ReturnType<typeof setTimeout> | null = null

function showTooltip(ev: MouseEvent | TouchEvent) {
  const clientX = 'touches' in ev ? ev.touches[0].clientX : ev.clientX
  const clientY = 'touches' in ev ? ev.touches[0].clientY : ev.clientY
  const rect = canvas.value!.getBoundingClientRect()
  const xPct = (clientX - rect.left - leftMargin.value) / (rect.width - leftMargin.value)
  const distSel = xPct * (props.data.activity.distance || 0)

  /* recherche du sample cliqué */
  const idx = samples.value.findIndex((s, i) => {
    const prev = samples.value[i - 1]
    return (prev?.distance ?? 0) <= distSel && (s.distance ?? 0) >= distSel
  })
  const i = idx === -1 ? samples.value.length - 1 : idx
  const s = samples.value[i]
  const prev = samples.value[i - 1] ?? s

  /* pente instantanée (si on a l'élévation) */
  let slope = null as number | null
  if (s.elevation != null && prev.elevation != null) {
    const delev = s.elevation - prev.elevation
    const ddist = (s.distance ?? 1) - (prev.distance ?? 0)
    slope = ddist ? (delev / ddist) * 100 : 0
  }

  tooltip.value = {
    visible: true,
    style: { left: `${clientX + 10}px`, top: `${clientY + 10}px` },
    distance: (s.distance ?? 0) - (prev?.distance ?? 0),
    cadence: Math.round(s.cadence ?? 0),
    slope
  }
  if (hideTT) clearTimeout(hideTT)
  hideTT = setTimeout(() => (tooltip.value.visible = false), 2000)
}

/* ===== Handlers & cycle de vie ===== */
function onGranularityChange() {
  savePrefs()
  resample()
}
function onUseSlopeChange() {
  savePrefs()
  resample()
}
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await loadPrefs()
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

.accent-cyan {
  accent-color: var(--color-cyan-500);
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
