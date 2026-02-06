const SPORT_LABELS: Record<string, string> = {
  running: 'Course a pied',
  RUNNING: 'Course a pied',
  RUN: 'Course a pied',
  run: 'Course a pied',
  cycling: 'Velo',
  CYCLING: 'Velo',
  bike: 'Velo',
  swimming: 'Natation',
  SWIMMING: 'Natation',
  swim: 'Natation',
  walking: 'Marche',
  WALKING: 'Marche',
  walk: 'Marche',
  hiking: 'Randonnee',
  HIKING: 'Randonnee',
  hike: 'Randonnee',
  trail_running: 'Trail',
  TRAIL_RUNNING: 'Trail',
  yoga: 'Yoga',
  YOGA: 'Yoga',
  fitness: 'Fitness',
  FITNESS: 'Fitness',
  skiing: 'Ski',
  SKIING: 'Ski',
  cross_country_skiing: 'Ski de fond',
  CROSS_COUNTRY_SKIING: 'Ski de fond'
}

// Common sport types always shown in the selector
export const COMMON_SPORT_TYPES = [
  'running',
  'cycling',
  'swimming',
  'walking',
  'hiking',
  'trail_running',
  'yoga',
  'fitness',
  'skiing'
]

export function formatSportType(sport: string): string {
  return SPORT_LABELS[sport] || sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase()
}
