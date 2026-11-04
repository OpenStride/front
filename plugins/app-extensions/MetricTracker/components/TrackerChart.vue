<template>
  <div class="chart">
    <canvas ref="canvas" role="img" :aria-label="label"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import Chart from 'chart.js/auto'
import { formatDate } from '@/utils/dateFormat'
import type { MetricDefinition } from '../types'
import type { Grain, MetricKind, Outing, Period, PointMode } from '../trackerData'
import { axisTicks, cssVar, gridLines, hatch, tooltipStyle } from '../chartStyle'

const props = defineProps<{
  kind: MetricKind
  metric: MetricDefinition
  periods: Period[]
  /** The window's outings, drawn faintly behind an intensity line. */
  outings: Outing[]
  /** For a best metric: the record as it stood at each period. */
  records: { value: number | null; isNew: boolean }[]
  grain: Grain
  mode: PointMode
  /** Mean of the complete periods, for the volume chart's dotted line. */
  average: number | null
  /** Named `label`, not `ariaLabel`: Vue leaves `aria-*` on the root as an attribute. */
  label: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function periodLabel(p: Period): string {
  return props.grain === 'month'
    ? formatDate(p.start.getTime(), { month: 'short', year: '2-digit' })
    : formatDate(p.start.getTime(), { day: 'numeric', month: 'short' })
}

/**
 * The record line: the record as the window opened, a step at each outing
 * that broke it, held to the end of the window.
 */
function recordLine(start: number, end: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const firstNew = props.records.findIndex(r => r.isNew)
  // Before the first break, the record is whatever stood before the window.
  const opening = firstNew === 0 ? null : props.records[Math.max(firstNew - 1, 0)]?.value
  if (opening !== null && opening !== undefined) out.push({ x: start, y: opening })
  props.periods.forEach((p, i) => {
    const rec = props.records[i]
    if (rec?.isNew && p.bestOuting && rec.value !== null) {
      out.push({ x: p.bestOuting.startTime, y: rec.value })
    }
  })
  if (out.length) out.push({ x: end, y: out[out.length - 1].y })
  return out
}

/** Middle of a period, where its point sits on a time axis. */
const middle = (p: Period) => (p.start.getTime() + p.end.getTime()) / 2

function draw() {
  chart?.destroy()
  chart = null
  if (!canvas.value || props.periods.length === 0) return

  const green = cssVar('--color-green-500', '#5f8f1a')
  const dark = cssVar('--color-green-700', '#3d5c10')
  const line = cssVar('--color-green-600', '#4d7314')
  const pale = cssVar('--color-green-200', '#d3e5a6')
  const ink = cssVar('--color-ink', '#1e1e2e')
  const tick = axisTicks()
  const fmt = (v: number) => props.metric.format(v)
  const y = {
    reverse: !!props.metric.betterIsLower,
    beginAtZero: props.kind === 'volume',
    border: { display: false },
    grid: gridLines(),
    ticks: { ...tick, maxTicksLimit: 5, callback: (v: number | string) => fmt(Number(v)) }
  }
  const common = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 }
  }

  if (props.kind === 'volume') {
    const complete = props.periods.filter(p => !p.isCurrent)
    const best = Math.max(...complete.map(p => p.value ?? 0))
    const datasets: object[] = [
      {
        type: 'bar',
        data: props.periods.map(p => p.value ?? 0),
        backgroundColor: props.periods.map(p =>
          p.isCurrent ? hatch(green) : p.value === best && best > 0 ? dark : green
        ),
        borderColor: green,
        borderWidth: props.periods.map(p => (p.isCurrent ? 1 : 0)),
        order: 2
      }
    ]
    if (props.average !== null && props.average > 0) {
      datasets.push({
        type: 'line',
        data: props.periods.map(() => props.average),
        borderColor: cssVar('--color-ink-soft', '#55554f'),
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 1
      })
    }
    chart = new Chart(canvas.value, {
      data: { labels: props.periods.map(periodLabel), datasets } as never,
      options: {
        ...common,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...tooltipStyle(),
            displayColors: false,
            filter: item => item.datasetIndex === 0,
            callbacks: { label: item => fmt(item.raw as number) }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { ...tick, maxRotation: 0, autoSkipPadding: 16 }
          },
          y
        }
      }
    })
    return
  }

  const start = props.periods[0].start.getTime()
  const end = props.periods[props.periods.length - 1].end.getTime()
  const x = {
    type: 'linear' as const,
    min: start,
    max: end,
    grid: { display: false },
    border: { display: false },
    ticks: {
      ...tick,
      maxRotation: 0,
      maxTicksLimit: 6,
      callback: (v: number | string) =>
        formatDate(
          Number(v),
          props.grain === 'month' ? { month: 'short' } : { day: 'numeric', month: 'short' }
        )
    }
  }
  const tooltip = {
    ...tooltipStyle(),
    displayColors: false,
    callbacks: {
      title: (items: { parsed: { x: number } }[]) =>
        items.length
          ? formatDate(items[0].parsed.x, { day: 'numeric', month: 'short', year: 'numeric' })
          : '',
      label: (item: { parsed: { y: number } }) => fmt(item.parsed.y)
    }
  }

  let datasets: object[]
  if (props.kind === 'intensity') {
    // Each outing faintly, and the period's point over it: the average of its
    // outings, or the best of them — the point is what the switch says.
    const points = props.periods
      .filter(p => p.value !== null)
      .map(p => ({
        x: props.mode === 'best' && p.bestOuting ? p.bestOuting.startTime : middle(p),
        y: p.value as number
      }))
    datasets = [
      {
        type: 'scatter',
        data: props.outings.map(o => ({ x: o.startTime, y: o.value })),
        pointRadius: 2.5,
        pointHoverRadius: 4,
        pointBackgroundColor: pale,
        pointBorderWidth: 0,
        order: 2
      },
      {
        type: 'line',
        data: points,
        borderColor: line,
        backgroundColor: line,
        borderWidth: 2.5,
        tension: 0,
        pointRadius: 3.5,
        pointBorderWidth: 0,
        order: 1
      }
    ]
  } else {
    // A best time: the best of each period, the record as it stood, and the
    // periods that broke it marked.
    const bests = props.periods
      .map((p, i) => ({ p, rec: props.records[i] }))
      .filter(({ p }) => p.value !== null && p.bestOuting)
    datasets = [
      {
        type: 'line',
        // The record holds until the outing that broke it, and changes on
        // that outing's date — not at the start of its month.
        data: recordLine(start, end),
        stepped: 'after',
        borderColor: ink,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 2
      },
      {
        type: 'scatter',
        data: bests.map(({ p }) => ({ x: p.bestOuting!.startTime, y: p.value as number })),
        pointRadius: bests.map(({ rec }) => (rec?.isNew ? 5.5 : 3.5)),
        pointBackgroundColor: bests.map(({ rec }) =>
          rec?.isNew ? dark : cssVar('--color-green-300', '#b9d673')
        ),
        pointBorderWidth: 0,
        order: 1
      }
    ]
  }

  chart = new Chart(canvas.value, {
    data: { datasets } as never,
    options: {
      ...common,
      plugins: { legend: { display: false }, tooltip: tooltip as never },
      scales: { x, y }
    }
  })
}

watch(
  () => [props.periods, props.outings, props.records, props.mode, props.kind, props.average],
  async () => {
    await nextTick()
    draw()
  }
)

onMounted(async () => {
  await nextTick()
  draw()
})

onUnmounted(() => chart?.destroy())
</script>

<style scoped>
.chart {
  position: relative;
  height: 16rem;
}
</style>
