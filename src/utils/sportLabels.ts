const SPORT_LABELS: Record<string, string> = {
  running: 'Course à pied',
  RUNNING: 'Course à pied',
  RUN: 'Course à pied',
  run: 'Course à pied',
  cycling: 'Vélo',
  CYCLING: 'Vélo',
  bike: 'Vélo',
  swimming: 'Natation',
  SWIMMING: 'Natation',
  swim: 'Natation',
  walking: 'Marche',
  WALKING: 'Marche',
  walk: 'Marche',
  hiking: 'Randonnée',
  HIKING: 'Randonnée',
  hike: 'Randonnée',
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

/** Font Awesome icon class by sport type (uppercase keys) */
export const SPORT_ICONS: Record<string, string> = {
  RUNNING: 'fas fa-person-running',
  RUN: 'fas fa-person-running',
  CYCLING: 'fas fa-person-biking',
  SWIMMING: 'fas fa-person-swimming',
  HIKING: 'fas fa-person-hiking',
  YOGA: 'fas fa-person-praying'
}

/** Get the FA icon class for a sport type, with fallback */
export function getSportIcon(sport: string): string {
  return SPORT_ICONS[sport?.toUpperCase()] ?? 'fas fa-medal'
}
