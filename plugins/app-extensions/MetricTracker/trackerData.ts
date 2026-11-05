import type { Activity } from '@/types/activity'
import { sportScopes, topSportScope } from '@/types/sport'
import { readValue } from './series'
import { toMs, type MetricDefinition, type MetricSources, type WindowId } from './types'

/**
 * What the tracker draws, folded from the activities: pure functions, so each
 * figure can be tested without a chart.
 *
 * A metric is one of three kinds, and the kind decides the chart:
 * - volume: a total per period (distance, time, ascent) — bars;
 * - intensity: a value per outing (pace, speed, heart rate) — one point per
 *   period, the period's average or its best outing, never one for the other;
 * - best: a best time over a distance — the best of each period, and the
 *   record as it stood at each date.
 */
export type MetricKind = 'volume' | 'intensity' | 'best'
export type Grain = 'week' | 'month'
/** What one point of an intensity series stands for. */
export type PointMode = 'avg' | 'best'

export function metricKind(metric: MetricDefinition): MetricKind {
  if (metric.distanceLabel) return 'best'
  if (metric.periodOp === 'sum') return 'volume'
  return 'intensity'
}

/** One activity's value, already in display units. */
export interface Outing {
  id: string
  startTime: number
  value: number
}

/**
 * Each activity's own value of the metric: a ratio metric divides the
 * activity's own figures (its pace is its distance over its time).
 */
export function outingsOf(
  activities: Activity[],
  sources: MetricSources,
  metric: MetricDefinition
): Outing[] {
  const out: Outing[] = []
  for (const activity of activities) {
    if (activity.deleted) continue
    const startTime = toMs(activity.startTime)
    if (!Number.isFinite(startTime) || startTime <= 0) continue
    const numerator = readValue(activity, sources, metric.sourceRef)
    if (numerator === null) continue
    let raw = numerator
    if (metric.denominatorRef) {
      const denominator = readValue(activity, sources, metric.denominatorRef)
      if (denominator === null || denominator <= 0) continue
      raw = numerator / denominator
    }
    const value = metric.toDisplay(raw)
    if (Number.isFinite(value)) out.push({ id: activity.id, startTime, value })
  }
  return out.sort((a, b) => a.startTime - b.startTime)
}

/** Whether `a` beats `b` for this metric. */
export function beats(metric: MetricDefinition, a: number, b: number): boolean {
  return metric.betterIsLower ? a < b : a > b
}

/** Midnight on the first day of the period `date` sits in, local time. */
export function periodStart(date: Date, grain: Grain): Date {
  if (grain === 'month') return new Date(date.getFullYear(), date.getMonth(), 1)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function nextPeriod(start: Date, grain: Grain): Date {
  const d = new Date(start)
  if (grain === 'month') d.setMonth(d.getMonth() + 1, 1)
  else d.setDate(d.getDate() + 7)
  return d
}

/** Where a window starts: so many months back, or at the first outing. */
export function windowStart(window: WindowId, firstOuting: number | null, now: Date): Date | null {
  if (window === 'all') return firstOuting === null ? null : new Date(firstOuting)
  const months = { '3m': 3, '6m': 6, '12m': 12 }[window]
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d
}

/** The grain that keeps a window readable: weeks up to six months, months beyond. */
export function defaultGrain(window: WindowId): Grain {
  return window === '3m' || window === '6m' ? 'week' : 'month'
}

export interface Period {
  start: Date
  /** Exclusive. */
  end: Date
  /** The period under way: drawn as unfinished, left out of averages. */
  isCurrent: boolean
  /** Display units; null for an intensity period with no outing. */
  value: number | null
  count: number
  /** The outing behind the value, when the value is a best. */
  bestOuting?: Outing
}

/**
 * One value per period, every period of the window included.
 *
 * A volume period with no outing is a zero — a week off is part of the load.
 * An intensity or best period with no outing has no value: there was no pace
 * that week, not a pace of zero.
 */
export function periodSeries(
  activities: Activity[],
  sources: MetricSources,
  metric: MetricDefinition,
  options: { grain: Grain; window: WindowId; mode: PointMode; now?: Date }
): Period[] {
  const now = options.now ?? new Date()
  const kind = metricKind(metric)
  const all = outingsOf(activities, sources, metric)
  const from = windowStart(options.window, all[0]?.startTime ?? null, now)
  if (!from) return []

  const periods: Period[] = []
  const currentStart = periodStart(now, options.grain).getTime()
  for (
    let start = periodStart(from, options.grain);
    start.getTime() <= currentStart;
    start = nextPeriod(start, options.grain)
  ) {
    periods.push({
      start,
      end: nextPeriod(start, options.grain),
      isCurrent: start.getTime() === currentStart,
      value: kind === 'volume' ? 0 : null,
      count: 0
    })
  }

  const first = periods[0]?.start.getTime() ?? 0
  const inWindow = activities.filter(a => {
    const t = toMs(a.startTime)
    return t >= first && t <= now.getTime()
  })

  const byPeriod = (t: number) => periods.find(p => t >= p.start.getTime() && t < p.end.getTime())

  if (kind === 'volume' || (kind === 'intensity' && options.mode === 'avg')) {
    // Sums (and ratios of sums) are taken on the raw figures, then converted:
    // a week's pace is its total distance over its total time, so a long slow
    // run weighs what it lasted rather than counting as one vote.
    const acc = new Map<Period, { num: number; den: number; values: number[] }>()
    for (const a of inWindow) {
      const p = byPeriod(toMs(a.startTime))
      if (!p) continue
      const num = readValue(a, sources, metric.sourceRef)
      if (num === null) continue
      const slot = acc.get(p) ?? { num: 0, den: 0, values: [] }
      if (metric.denominatorRef) {
        const den = readValue(a, sources, metric.denominatorRef)
        if (den === null || den <= 0) continue
        slot.den += den
      }
      slot.num += num
      slot.values.push(num)
      acc.set(p, slot)
      p.count += 1
    }
    for (const [p, slot] of acc) {
      let raw: number
      if (kind === 'volume') raw = slot.num
      else if (metric.denominatorRef) raw = slot.num / slot.den
      else raw = slot.values.reduce((s, v) => s + v, 0) / slot.values.length
      p.value = metric.toDisplay(raw)
    }
    if (kind === 'volume') for (const p of periods) if (p.count === 0) p.value = 0
    return periods
  }

  // Best of the period: the one outing that beat the others.
  const outings = all.filter(o => o.startTime >= first && o.startTime <= now.getTime())
  for (const o of outings) {
    const p = byPeriod(o.startTime)
    if (!p) continue
    p.count += 1
    if (!p.bestOuting || beats(metric, o.value, p.bestOuting.value)) {
      p.bestOuting = o
      p.value = o.value
    }
  }
  return periods
}

/**
 * The record as it stood at the end of each period, and the periods that set
 * a new one. The first best of the window counts as a record only if no
 * earlier outing beat it.
 */
export function recordSteps(
  periods: Period[],
  metric: MetricDefinition,
  before: number | null
): { value: number | null; isNew: boolean }[] {
  let record = before
  return periods.map(p => {
    if (p.value !== null && (record === null || beats(metric, p.value, record))) {
      record = p.value
      return { value: record, isNew: true }
    }
    return { value: record, isNew: false }
  })
}

/** The best outing ever, whatever the window: what a record is measured against. */
export function bestOuting(outings: Outing[], metric: MetricDefinition): Outing | null {
  let best: Outing | null = null
  for (const o of outings) if (!best || beats(metric, o.value, best.value)) best = o
  return best
}

/** The sport with the most outings, canonical. */
export function mainSport(activities: Activity[]): string {
  // Counted by menu choice, so trails and road runs add up to "running".
  const scopes = sportScopes(activities.map(a => a.type))
  const counts = new Map<string, number>()
  for (const a of activities) {
    if (a.deleted || !a.type) continue
    const s = topSportScope(a.type, scopes)
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  let best = ''
  let n = 0
  for (const [s, c] of counts) {
    if (c > n) {
      best = s
      n = c
    }
  }
  return best
}
