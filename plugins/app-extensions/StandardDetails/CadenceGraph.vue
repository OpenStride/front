<template>
  <div class="bg-white rounded-lg shadow p-4">
    <!-- ===== En-tête : titre + contrôles ===== -->
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
        <svg class="w-5 h-5 text-cyan-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 2a1 1 0 0 0-1 1v4.28a9 9 0 0 0 4 17.45 9 9 0 0 0 4-17.45V3a1 1 0 0 0-2 0v3.09a7 7 0 1 1-4 0V3a1 1 0 0 0-1-1Z"/>
            </svg>
        Cadence
        </h3>

      <div class="flex items-center gap-2">
        <!-- Case à cocher “Variation de pente” : masquée si on affiche les laps -->
        <label
          v-if="granularity !== 'laps'"
          class="text-sm flex items-center gap-1"
        >
          <input
            type="checkbox"
            v-model="useSlope"
            @change="onUseSlopeChange"
            class="accent-[cyan]"
          />
          Variation&nbsp;de&nbsp;pente
        </label>

        <!-- Sélecteur de granularité -->
        <select
          v-model="granularity"
          @change="onGranularityChange"
          class="text-sm border px-2 py-1 rounded"
        >
          <option v-for="opt in granularities" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- ===== Graphique ===== -->
    <canvas ref="canvas" width="800" height="400"></canvas>

    <!-- ===== Infobulle ===== -->
    <div
      v-if="tooltip.visible"
      :style="tooltip.style"
      class="fixed z-50 bg-white text-sm shadow px-3 py-2 rounded border border-gray-200 transition-opacity duration-150"
    >
      <div><strong>Distance :</strong> {{ tooltip.distance.toFixed(0) }} m</div>
      <div><strong>Cadence :</strong> {{ tooltip.cadence }} pas/min</div>
      <div v-if="tooltip.slope !== null">
        <strong>Pente :</strong> {{ tooltip.slope.toFixed(1) }} %
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getIndexedDBService } from '@/services/IndexedDBService'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import type { Activity, ActivityDetails, Sample } from '@/types/activity'

/* ===== Props ===== */
const props = defineProps<{
  data: { activity: Activity; details: ActivityDetails }
}>()

/* ===== Références & états ===== */
const canvas      = ref<HTMLCanvasElement | null>(null)
const samples     = ref<Sample[]>([])
const granularity = ref('1000')      // distance (m) ou 'laps'
const useSlope    = ref(false)       // mode variation de pente

/* ===== Options de granularité ===== */
const granularities = [
  { label: '100 m', value: '100' },
  { label: '200 m', value: '200' },
  { label: '500 m', value: '500' },
  { label: '1 km',  value: '1000' },
  { label: '2 km',  value: '2000' },
  { label: '5 km',  value: '5000' },
  { label: 'Laps',  value: 'laps' }
]

/* ===== Persistance (IndexedDB) ===== */
async function savePrefs() {
  const db = await getIndexedDBService()
  await db.saveData('granularity_for_cadence', granularity.value)
  await db.saveData('use_slope_for_cadence', useSlope.value)
}
async function loadPrefs() {
  const db = await getIndexedDBService()
  const g = await db.getData('granularity_for_cadence')
  const s = await db.getData('use_slope_for_cadence')
  if (typeof g === 'string')  granularity.value = g
  if (typeof s === 'boolean') useSlope.value    = s
}

/* ===== Re-échantillonnage ===== */
async function resample() {
  const analyzer = new ActivityAnalyzer(props.data.details.samples ?? [])
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
  const hue  = 186;          // cyan
  const sat  = 80;           // %
  const t    = (c - min) / (max - min || 1);  // 0 → 1
  const light = 65 - t * 35; // 65 % (lent) → 30 % (rapide)
  const alpha = 0.7;         // transparence douce
  return `hsla(${hue} ${sat}% ${light}% / ${alpha})`;
}

/* ===== Dessin du graphique ===== */
function drawCanvas() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx || samples.value.length === 0) return

  const W = canvas.value!.width
  const H = canvas.value!.height
  ctx.clearRect(0, 0, W, H)

  /* === Cadence min / max === */
  const cadences = samples.value.map(s => s.cadence ?? 0)
  let minC = Math.min(...cadences)
  let maxC = Math.max(...cadences)
  const thr = 0.1 * (maxC - minC || 1)
  minC = Math.max(minC - thr, 0)
  maxC += thr

  /* === Layout === */
  const pxMargin   = 50
  const plotTop    = 30
  const plotHeight = H - 50
  const baseline   = plotTop + plotHeight
  const totalDist  = props.data.activity.distance || 1

  /* === Grille horizontale (cadence) === */
  ctx.strokeStyle = '#e0e0e0'
  ctx.fillStyle   = '#888'
  ctx.font        = '10px sans-serif'
  for (let c = Math.floor(minC / 10) * 10; c <= maxC + 10; c += 10) {
    const y = plotTop + ((c - minC) / (maxC - minC || 1)) * plotHeight
    ctx.beginPath()
    ctx.moveTo(pxMargin, y)
    ctx.lineTo(W, y)
    ctx.stroke()
    ctx.fillText(`${c}`, 8, y + 4)
  }

  /* === Grille verticale (distance) === */
  const kmTotal  = totalDist / 1000
  const rawStep  = kmTotal / 10
  const mag      = 10 ** Math.floor(Math.log10(rawStep))
  const niceBase = [1, 2, 5].find(b => b * mag >= rawStep) || 10
  const stepKm   = niceBase * mag
  for (let km = stepKm; km < kmTotal; km += stepKm) {
    const x = pxMargin + (km * 1000 / totalDist) * (W - pxMargin)
    ctx.beginPath()
    ctx.moveTo(x, plotTop)
    ctx.lineTo(x, baseline)
    ctx.stroke()
  }

  /* === Profil altitude (gris) === */
  const raw   = (props.data.details.samples ?? [])
    .filter((_, i) => i % 5 === 0)
    .filter(s => s.elevation != null)
  const elevs = raw.map(s => s.elevation as number)
  const minE  = Math.min(...elevs)
  const maxE  = Math.max(...elevs)
  const padE  = (maxE - minE || 1) * 0.1
  const minVE = minE - padE
  const maxVE = maxE + padE
  const rangeE = maxVE - minVE || 1

  ctx.beginPath()
  ctx.strokeStyle = '#888'
  ctx.lineWidth   = 1
  let xCur = pxMargin
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i].distance ?? 0
    const e = raw[i].elevation ?? 0
    xCur    = pxMargin + (d / totalDist) * (W - pxMargin)
    const y = baseline - ((e - minVE) / rangeE) * plotHeight
    i === 0 ? ctx.moveTo(xCur, y) : ctx.lineTo(xCur, y)
  }
  ctx.stroke()
  ctx.lineTo(xCur, baseline)
  ctx.lineTo(pxMargin, baseline)
  ctx.fillStyle = '#f0f0f0'
  ctx.fill()

  /* === Barres de cadence === */
  for (let i = 0; i < samples.value.length; i++) {
      const s      = samples.value[i]
      const d0     = i === 0 ? 0 : (samples.value[i - 1].distance ?? 0)
      const d1     = s.distance ?? 0
      const xStart = pxMargin + (d0 / totalDist) * (W - pxMargin)
      const wPx    = ((d1 - d0) / totalDist) * (W - pxMargin)
      const c      = s.cadence ?? 0
      ctx.fillStyle = ctx.fillStyle = getColorFromCadence(c, minC, maxC)
    const hPx    = ((c - minC) / (maxC - minC || 1)) * plotHeight
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
  const rect    = canvas.value!.getBoundingClientRect()
  const xPct    = (clientX - rect.left - 50) / (rect.width - 50)
  const distSel = xPct * (props.data.activity.distance || 0)

  /* recherche du sample cliqué */
  const idx = samples.value.findIndex((s, i) => {
    const prev = samples.value[i - 1]
    return (prev?.distance ?? 0) <= distSel && (s.distance ?? 0) >= distSel
  })
  const i     = idx === -1 ? samples.value.length - 1 : idx
  const s     = samples.value[i]
  const prev  = samples.value[i - 1] ?? s

  /* pente instantanée (si on a l’élévation) */
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
onMounted(async () => {
  await loadPrefs()
  await resample()
  canvas.value?.addEventListener('click', showTooltip)
  canvas.value?.addEventListener('touchstart', showTooltip)
})
onBeforeUnmount(() => {
  canvas.value?.removeEventListener('click', showTooltip)
  canvas.value?.removeEventListener('touchstart', showTooltip)
})
</script>

<style scoped>
canvas { max-width: 100%; }
</style>
