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
  treadmill_running: 'Tapis de course',
  yoga: 'Yoga',
  YOGA: 'Yoga',
  fitness: 'Fitness',
  FITNESS: 'Fitness',
  fitness_equipment: 'Fitness',
  strength_training: 'Musculation',
  cardio_training: 'Cardio',
  indoor_cycling: "Vélo d'intérieur",
  mountain_biking: 'VTT',
  e_biking: 'Vélo électrique',
  pool_swimming: 'Natation piscine',
  open_water_swimming: 'Eau libre',
  rowing: 'Aviron',
  rowing_machine: 'Rameur',
  elliptical: 'Elliptique',
  stretching: 'Étirements',
  pilates: 'Pilates',
  skiing: 'Ski',
  SKIING: 'Ski',
  alpine_skiing: 'Ski alpin',
  cross_country_skiing: 'Ski de fond',
  CROSS_COUNTRY_SKIING: 'Ski de fond',
  snowboarding: 'Snowboard',
  other: 'Autre'
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
  if (SPORT_LABELS[sport]) return SPORT_LABELS[sport]
  // Humanise unknown slugs: "strength_training" → "Strength Training"
  return sport
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
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
