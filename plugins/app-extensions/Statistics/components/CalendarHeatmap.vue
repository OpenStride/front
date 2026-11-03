<template>
  <DashCard :title="t('statistics.heatmap.title')" icon="fa-calendar-days" data-test="calendar">
    <template #aside>
      <strong class="active">{{
        t('statistics.heatmap.activeWeeks', { active, total: weeks })
      }}</strong>
    </template>

    <div ref="scrollArea" class="scroll">
      <div class="grid" :style="{ gridTemplateColumns: `2rem repeat(${weeks}, 1.1rem)` }">
        <span
          v-for="m in months"
          :key="`m${m.col}`"
          class="month"
          :style="{ gridColumn: m.col + 1, gridRow: 1 }"
          >{{ m.label }}</span
        >
        <span
          v-for="row in [1, 3, 5, 7]"
          :key="`d${row}`"
          class="weekday"
          :style="{ gridColumn: 1, gridRow: row + 1 }"
          >{{ weekdayNarrow(row) }}</span
        >
        <span
          v-for="cell in cells"
          :key="cell.key"
          :class="['cell', `level-${cell.level}`]"
          :title="cell.tooltip"
          :style="{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }"
        ></span>
      </div>
    </div>

    <div class="legend" aria-hidden="true">
      <span>{{ t('statistics.heatmap.less') }}</span>
      <span v-for="l in 5" :key="l" :class="['cell', `level-${l - 1}`]"></span>
      <span>{{ t('statistics.heatmap.more') }}</span>
    </div>
  </DashCard>
</template>

<script setup lang="ts">
import DashCard from './DashCard.vue'
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Activity } from '@/types/activity'
import { formatDate, monthShort, weekdayNarrow } from '@/utils/dateFormat'
import { formatCompactDuration } from '@/utils/duration'
import { getDayKey } from '@/utils/dateKeys'
import { toMs } from '@/utils/timeRange'
import { activeWeeks, weekStart } from '../dashboardData'

/** One column: a 1.1rem cell and the 3px gap after it, in px at 16px/rem. */
const COLUMN_PX = 17.6 + 3
/** The day-label column on the left. */
const LABEL_PX = 32 + 3
/** At least a training block; at most a year. */
const MIN_WEEKS = 12
const MAX_WEEKS = 53

const { t } = useI18n()

const props = defineProps<{
  activities: Activity[]
}>()

const scrollArea = ref<HTMLElement | null>(null)

/**
 * As many weeks as the card holds, at a fixed cell size: about a year on a
 * desktop, three to four months on a phone. Stretching cells to fill a wide
 * card made the grid read as a board of buttons; a fixed count left half the
 * card empty.
 */
const weeks = ref(26)
let observer: ResizeObserver | null = null

function fit(width: number) {
  const fitting = Math.floor((width - LABEL_PX) / COLUMN_PX)
  weeks.value = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, fitting))
}

onMounted(() => {
  if (!scrollArea.value) return
  fit(scrollArea.value.clientWidth)
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(entries => fit(entries[0].contentRect.width))
  observer.observe(scrollArea.value)
})
onUnmounted(() => observer?.disconnect())

/** The latest weeks are the ones read; a phone scrolls them into view. */
function scrollToEnd() {
  nextTick(() => {
    if (scrollArea.value) scrollArea.value.scrollLeft = scrollArea.value.scrollWidth
  })
}
onMounted(scrollToEnd)
watch(() => props.activities, scrollToEnd)

/**
 * Time per day: the one quantity comparable across sports, so an hour on the
 * bike and an hour's run shade the same.
 */
const byDay = computed(() => {
  const map = new Map<string, { duration: number; count: number }>()
  for (const a of props.activities) {
    if (a.deleted) continue
    const key = getDayKey(new Date(toMs(a.startTime)))
    const day = map.get(key) ?? { duration: 0, count: 0 }
    day.duration += a.duration || 0
    day.count += 1
    map.set(key, day)
  }
  return map
})

const first = computed(() => {
  const d = weekStart(new Date())
  d.setDate(d.getDate() - (weeks.value - 1) * 7)
  return d
})

const months = computed(() => {
  const out: { label: string; col: number }[] = []
  let last = -1
  for (let w = 0; w < weeks.value; w++) {
    const d = new Date(first.value)
    d.setDate(d.getDate() + w * 7)
    if (d.getMonth() !== last) {
      out.push({ label: monthShort(d.getMonth()), col: w + 1 })
      last = d.getMonth()
    }
  }
  return out
})

const cells = computed(() => {
  const today = new Date()
  const durations = [...byDay.value.values()].map(d => d.duration).filter(d => d > 0)
  durations.sort((a, b) => a - b)
  const q = (p: number) => durations[Math.floor(durations.length * p)] ?? 0
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)]
  const level = (v: number) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4)

  const out: { key: string; col: number; row: number; level: number; tooltip: string }[] = []
  for (let w = 0; w < weeks.value; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(first.value)
      d.setDate(d.getDate() + w * 7 + r)
      if (d > today) continue
      const key = getDayKey(d)
      const day = byDay.value.get(key)
      const date = formatDate(d.getTime(), { weekday: 'short', day: 'numeric', month: 'short' })
      out.push({
        key,
        col: w + 1,
        row: r + 1,
        level: level(day?.duration ?? 0),
        tooltip: day
          ? `${date} · ${formatCompactDuration(day.duration)} · ${t('statistics.heatmap.activityCount', day.count)}`
          : date
      })
    }
  }
  return out
})

const active = computed(() => activeWeeks(props.activities, weeks.value))
</script>

<style scoped>
.scroll {
  overflow-x: auto;
}

.grid {
  display: grid;
  grid-template-rows: 1.1rem repeat(7, auto);
  gap: 3px;
  min-width: min-content;
}

.month,
.weekday {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-faint);
  white-space: nowrap;
  line-height: 1.1rem;
}

.cell {
  aspect-ratio: 1;
  /* Square, like the cards and the bars around it: rounded tiles read as
     buttons, and these are not. */
  border-radius: 0;
}

.level-0 {
  background: var(--surface-muted);
}
.level-1 {
  background: var(--color-green-100);
}
.level-2 {
  background: var(--color-green-300);
}
.level-3 {
  background: var(--color-green-500);
}
.level-4 {
  background: var(--color-green-700);
}

.legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 0.8rem;
  font-size: 0.75rem;
  color: var(--text-faint);
}

.legend .cell {
  width: 0.75rem;
}
.active {
  color: var(--text-color);
}
</style>
