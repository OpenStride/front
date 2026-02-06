export type GoalType = 'distance' | 'count' | 'duration'
export type GoalPeriod = 'week' | 'month'

export interface Goal {
  id: string
  type: GoalType
  period: GoalPeriod
  targetValue: number // km | nombre | heures
  sportType?: string // undefined = tous sports
  enabled: boolean
  createdAt: number
}

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
