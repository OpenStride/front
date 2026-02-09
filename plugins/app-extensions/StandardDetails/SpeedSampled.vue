<template>
  <div class="bg-white rounded-lg shadow p-4">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-xl font-semibold mb-5 flex items-center gap-2">
          <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 1a1 1 0 0 0-1 1v2.07a9 9 0 1 0 2 0V2a1 1 0 0 0-1-1Zm0 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7Zm.5-11h-1a1 1 0 0 0-1 1v4.25a1 1 0 0 0 .4.8l3.5 2.45a1 1 0 0 0 1.2-1.6L13 12.3V9a1 1 0 0 0-1-1Z"/>
          </svg>
          Allure
        </h3>
      <div class="flex items-center gap-2">
        <!-- Masque la case si on est en mode “laps” -->
        <label
          v-if="slopeGranularity !== 'laps'"
          class="text-sm flex items-center gap-1"
        >
          <input
            type="checkbox"
            v-model="useSlope"
            @change="onUseSlopeChange"
            class="accent-[#88aa00]"
          />Variation de pente
        </label>
        <select
          v-model="slopeGranularity"
          @change="onGranularityChange"
          class="text-sm border px-2 py-1 rounded"
        >
          <option v-for="option in granularities" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
    <canvas ref="canvas" width="800" height="400"></canvas>
    <div
      v-if="tooltip.visible"
      :style="tooltip.style"
      class="fixed z-50 bg-white text-sm shadow px-3 py-2 rounded border border-gray-200 transition-opacity duration-150"
    >
      <div><strong>Distance :</strong> {{ tooltip.distance.toFixed(2) }} m</div>
      <div><strong>Vitesse :</strong> {{ tooltip.pace }} min/km</div>
      <div><strong>{{ tooltip.slopeLabel }}</strong>({{ tooltip.slope.toFixed(1) }}%)</div>
    </div>


     <!-- ===== Tableau récapitulatif ===== -->
    <div class="mt-6">
      <div class="flex text-xs sm:text-sm font-semibold border-b pb-1 mb-1">
        <span class="w-16">Dist.</span>
        <span class="flex-1">Allure</span>
        <span class="w-10 text-right">Pace</span>
        <span class="w-12 text-right">FC</span>       
        <span class="w-20 text-right">Pente</span>
      </div>

      <div
        v-for="(s, i) in samples"
        :key="i"
        class="flex items-center py-1 text-xs sm:text-sm"
      >
        <!-- Distance cumulée -->
        <span class="w-16">{{ segmentDistance(s, i).toFixed(0) }} m</span>

        <!-- Barre horizontale représ. la pace -->
        <div class="flex-1 h-3 bg-gray-100 rounded mx-1 overflow-hidden">
          <div
            class="h-full bg-green-500 rounded"
            :style="{ width: paceBarWidth(s) + '%' }"
          />
        </div>

        <!-- Pace numérique -->
        <span class="w-10 text-right">{{ paceStr(s) }}</span>

         <!-- FC moyenne -->
        <span class="w-12 text-right">
          {{ hrAvg(s) ?? '—' }}
        </span>

        <!-- Icône pente + % -->
        <span class="w-20 text-right">
          <span class="inline-block w-4 text-center">{{ slopeIcon(s) }}</span>
          <span class="ml-1">{{ slopePct(s).toFixed(1) }} %</span>
        </span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onBeforeUnmount  } from 'vue'
import { getIndexedDBService } from '@/services/IndexedDBService'
import { ActivityAnalyzer } from '@/services/ActivityAnalyzer'
import type { Activity, ActivityDetails, Sample } from '@/types/activity'

const props = defineProps<{ data: { activity: Activity; details: ActivityDetails } }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const samples = ref<Sample[]>([])

const useSlope = ref(false)
const slopeGranularity = ref('1000')

const granularities = [
  { label: '100m', value: '100' },
  { label: '200m', value: '200' },
  { label: '500m', value: '500' },
  { label: '1km', value: '1000' },
  { label: '2km', value: '2000' },
  { label: '5km', value: '5000' },
  { label: 'Laps', value: 'laps' } 
]

async function savePreferences() {
  const db = await getIndexedDBService()
  await db.saveData('granularity_for_speed', slopeGranularity.value)
  await db.saveData('use_slope_for_speed', useSlope.value)
}

async function loadPreferences() {
  const db = await getIndexedDBService()
  const storedGranularity = await db.getData('granularity_for_speed')
  const storedUseSlope = await db.getData('use_slope_for_speed')
  if (typeof storedGranularity === 'string') slopeGranularity.value = storedGranularity
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
  const analyzer = new ActivityAnalyzer(props.data.details.samples ?? [])
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
  const lightness = 75 - ratio * 40           // même dégradé L
  const alpha = 0.8                           // transparence douce
  return `hsla(75, 70%, ${lightness}%, ${alpha})`
}

function drawCanvas() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx || samples.value.length === 0) return

  const width = canvas.value!.width
  const height = canvas.value!.height
  
  const pxMargin = 50;
  ctx.clearRect(0, 0, width, height)

  const speeds = samples.value.map(s => s.speed ?? 0)
  let minSpeed = Math.min(...speeds)
  let maxSpeed = Math.max(...speeds)

  const treshold = 0.1 * (maxSpeed - minSpeed || 1);
  minSpeed = Math.max(minSpeed - treshold, 0);
  maxSpeed = Math.max(maxSpeed + treshold, minSpeed + 0.1);


  const totalDistance = props.data.activity?.distance; // samples.value[samples.value.length - 1]?.distance ?? 1

  const plotTop = 30
  const plotHeight = height - 50
  const baseline = plotTop + plotHeight

  // === Grille et axes ===
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.font = '10px sans-serif'
  ctx.fillStyle = '#888'

  let minPace = 1000 / maxSpeed || 0
  let maxPace = 1000 / minSpeed || 0
  const margin = 0.0 * (maxPace - minPace || 1)     // marge visuelle 10 %
    minPace = Math.max(minPace - margin, 0)
    maxPace += margin

  /* ---------- 2. Graduations toutes les 30 s ---------- */
  const STEP_SEC   = 30                              // 30 s
  const firstTick  = Math.floor(minPace / STEP_SEC) * STEP_SEC -
                    STEP_SEC                        // tick plus rapide
  const lastTick   = Math.ceil (maxPace / STEP_SEC) * STEP_SEC +
                    STEP_SEC                        // tick plus lent

  function getFontSize(w: number): number {
    // largeur < 400 px → 12 px ; 400-800 px → 14-16 px ; > 800 px → 18 px max
    return Math.min(20, Math.max(12, Math.round(w / 30)))
  }

  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth   = 1
  const fontSize = getFontSize(width)
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle   = '#888'

  for (let pSec = firstTick; pSec <= lastTick; pSec += STEP_SEC) {
    const y = plotTop + ((pSec - minPace) / (maxPace - minPace || 1)) * plotHeight;ctx.beginPath()
    ctx.moveTo(pxMargin, y)
    ctx.lineTo(width, y)
    ctx.stroke()

    const mm = Math.floor(pSec / 60)
    const ss = String(pSec % 60).padStart(2, '0')
    ctx.fillText(`${mm}:${ss}`, 5, y + 4)            // “mm:ss”
  }

  // === Repères verticaux distance (max 10) ===
  const totalKm  = totalDistance / 1000
  const maxTicks = 10;


  /* 1) pas brut */
  const rawStep  = totalKm / maxTicks          // ex. 2.7 km

  /* 2) arrondi à 1 ·10ⁿ, 2 ·10ⁿ ou 5 ·10ⁿ  -------------------- */
  const mag      = Math.pow(10, Math.floor(Math.log10(rawStep)))  // 10ⁿ
  const niceBase = [1, 2, 5].find(b => b * mag >= rawStep) || 10
  const stepKm   = niceBase * mag                                 // ex. 5 km

  /* 3) tracé des traits --------------------------------------- */
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1

  for (let km = stepKm; km < totalKm; km += stepKm) {
    const x = pxMargin + (km * 1000 / totalDistance) * (width - pxMargin)
    ctx.beginPath()
    ctx.moveTo(x, plotTop)
    ctx.lineTo(x, baseline)
    ctx.stroke()
  }

   // === Altitude ==================================================
const rawSamples = (props.data.details.samples ?? [])
  .filter((_, idx) => idx % 5 === 0)          // 1/5 des points
  .filter(s => s.elevation != null); 
const elevations = rawSamples
  .map(s => s.elevation)
  .filter((e): e is number => e != null);
const minElev      = Math.min(...elevations)
const maxElev      = Math.max(...elevations)
const elevRange    = maxElev - minElev || 1         // éviter /0
const padRatio     = 0.10                           // 10 %
const flatThresh   = 5                              // ≤5 m = « plat »

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
ctx.strokeStyle = '#888'
ctx.lineWidth   = 1

let x = pxMargin
for (let i = 0; i < rawSamples.length; i++) {
  const s     = rawSamples[i]
  const dist  = s.distance ?? 0
  const elev  = s.elevation ?? 0

  x = pxMargin + (dist / totalDistance) * (width - pxMargin)

  // projection verticale
   const y = baseline - ((elev - minVisElev) / visRange) * plotHeight
 
  if (i === 0) ctx.moveTo(x, y)
  else         ctx.lineTo(x, y)
}
ctx.stroke()


  ctx.lineTo(x,baseline);
  ctx.lineTo(pxMargin,baseline);
  ctx.fillStyle = '#f0f0f0';
  ctx.fill();

  // === Barres vitesse ===
  for (let i = 0; i < samples.value.length; i++) {
    const s = samples.value[i]
    const d0 = i === 0 ? 0 : (samples.value[i - 1]?.distance ?? 0)
    const d1 = s.distance ?? 0
    const xStart = pxMargin + (d0 / totalDistance) * (width - pxMargin)
    const widthPx = ((d1 - d0) / totalDistance) * (width - pxMargin)
    const speed = s.speed ?? 0
    const paceSec   = (speed) > 0 ? 1000 / (speed as number) : maxPace
    const heightPx       = ((maxPace - paceSec) / (maxPace - minPace || 1)) * plotHeight
    //const heightPx = ((speed - minSpeed) / (maxSpeed - minSpeed || 1)) * plotHeight
    ctx.fillStyle = getColorFromSpeed(speed, minSpeed, maxSpeed)
    ctx.fillRect(xStart, baseline - heightPx, widthPx - 1, heightPx)
  }

 
}

const selectedInfo = ref<{ pace: string; slope: number; type: string } | null>(null)

function classifySlope(slope: number): string {
  if (slope > 5) return 'montée'
  if (slope < -5) return 'descente'
  return 'plat'
}

const tooltip = ref({
  visible: false,
  style: {},
  speed: 0,
  pace: '',
  distance: 0,
  slope: 0,
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
  const totalDistance = props.data.activity?.distance;
  
  const pxMargin = 50;
  
  const relativeX = (x - pxMargin) / (width - pxMargin)
  const clickedDistance = relativeX * totalDistance

  // Trouver le sample le plus proche
  let index = samples.value.findIndex((s, i) => {
    const prev = samples.value[i - 1]
    return (prev?.distance ?? 0) <= clickedDistance && (s.distance ?? 0) >= clickedDistance
  })

  if (index === -1) index = samples.value.length - 1

  const s = samples.value[index]
  const prev = samples.value[index - 1] ?? s
  if (!s) return

  //fix speed m/s to min/km
  const speedMps = s.speed ?? 0;
  const secPerKm = 1000 / speedMps;

  // minutes + secondes (format mm:ss)
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  const paceStr = `${min}:${sec.toString().padStart(2, "0")}`;

  const speed = speedMps ?? 0
  const slope = s.elevation !== undefined && index > 0
    ? ((s.elevation - (samples.value[index - 1].elevation ?? s.elevation)) /
        ((s.distance ?? 1) - (samples.value[index - 1].distance ?? 0))) * 100
    : 0

  tooltip.value = {
    visible: true,
    style: {
      left: `${clientX + 10}px`,
      top: `${clientY + 10}px`
    },
    distance: ((s.distance ?? 0) - (prev?.distance ?? 0)),
    speed,
    pace: paceStr,
    slope,
    slopeLabel: classifySlopeValue(slope)
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
function paceStr(sample: Sample) {
  const p = paceSec(sample)
  if (!isFinite(p)) return '—'
  const m = Math.floor(p / 60)
  const s = String(Math.round(p % 60)).padStart(2, '0')
  return `${m}:${s}`
}
/* largeur relative : plus la pace est rapide, plus la barre est longue  */
function paceBarWidth(sample: Sample) {
  const pace = paceSec(sample)
  if (!isFinite(pace)) return 0

  const all = samples.value.map(paceSec).filter(isFinite)
  const localMin = Math.min(...all)
  const localMax = Math.max(...all)
  const threshold = 0.1 * (localMax - localMin || 1)   // 10 %
  const baselineMin = localMin - threshold             // plus rapide encore
  const baselineMax = localMax                         // plus lent

  /* largeur entre 5 % et 100 % pour rester visible */
  const ratio = (baselineMax - pace) / (baselineMax - baselineMin || 1)
  return Math.max(5, ratio * 100)
}
/* pente (%) entre ce sample et le précédent (ou 0) */
function slopePct(sample: Sample, i = samples.value.indexOf(sample)) {
  if (i <= 0) return 0
  const prev = samples.value[i - 1]
  const delev = (sample.elevation ?? 0) - (prev.elevation ?? 0)
  const ddist = (sample.distance ?? 1) - (prev.distance ?? 0)
  return ddist ? (delev / ddist) * 100 : 0
}
function slopeIcon(sample: Sample) {
  const s = slopePct(sample)
  if (s > 0.5) return '↗︎'
  if (s < -0.5) return '↘︎'
  return '→'
}

function hrAvg(sample: Sample) {
  return sample.heartRate != null ? Math.round(sample.heartRate) : null
}

/* distance du segment (m) */
function segmentDistance(sample: Sample, i = samples.value.indexOf(sample)) {
  if (i === 0) return sample.distance ?? 0
  return (sample.distance ?? 0) - (samples.value[i - 1].distance ?? 0)
}

onMounted(async () => {
  await loadPreferences()
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
canvas {
  max-width: 100%;
}
</style>
