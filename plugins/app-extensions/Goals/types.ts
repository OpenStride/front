export type GoalType = 'distance' | 'count' | 'duration'
export type GoalPeriod = 'week' | 'month'

export interface Goal {
  id: string
  type: GoalType
  period: GoalPeriod
  /**
   * The target, in SI: **metres** for a distance, **seconds** for a duration,
   * a plain count otherwise.
   *
   * This config is replicated through `settings`, so it must not hold a value
   * that depends on how its owner reads numbers. It used to be kilometres and
   * hours: an imperial reader typing "50" aimed at 50 miles and got 50 km, and
   * the wrong number then travelled to every device.
   */
  targetValue: number
  sportType?: string // undefined = tous sports
  enabled: boolean
  createdAt: number
}

/**
 * Bumped when the meaning of a stored field changes.
 *
 * A config written before goals were stored in SI holds kilometres where metres
 * are now read — a 50 km goal would silently become 50 m, i.e. permanently
 * complete. Such a config is dropped rather than reinterpreted.
 */
export const GOALS_CONFIG_VERSION = 2

export interface GoalsConfig {
  version: number
  goals: Goal[]
}

export interface GoalProgress {
  goal: Goal
  currentValue: number
  percentage: number
  isComplete: boolean
}
