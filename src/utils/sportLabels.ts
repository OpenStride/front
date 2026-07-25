import { i18n } from '@/locales'

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

/**
 * Localised label for a sport slug.
 *
 * Resolves via i18n (`sports.<slug>`), so sport names follow the app locale.
 * Provider adapters normalise to canonical slugs (see each plugin's sportTypes.ts).
 * Unknown / untranslated slugs fall back to a humanised form
 * ("strength_training" → "Strength Training").
 */
export function formatSportType(sport: string): string {
  if (!sport) return ''
  const key = `sports.${sport.toLowerCase()}`
  if (i18n.global.te(key)) return i18n.global.t(key)
  return sport
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Font Awesome 6 (Free) icon class by sport slug.
 *
 * Not every SportType has a dedicated Free icon; those intentionally fall back to
 * `fa-medal` via getSportIcon(). The set of icon-less sports is asserted in
 * tests/unit/sportTypes.spec.ts so any gap is a deliberate choice, not an oversight.
 */
export const SPORT_ICONS: Record<string, string> = {
  // Running
  running: 'fas fa-person-running',
  treadmill_running: 'fas fa-person-running',
  trail_running: 'fas fa-person-running',
  // Cycling
  cycling: 'fas fa-person-biking',
  cyclocross: 'fas fa-person-biking',
  mountain_biking: 'fas fa-person-biking',
  e_biking: 'fas fa-person-biking',
  indoor_cycling: 'fas fa-person-biking',
  // Gym & fitness
  fitness: 'fas fa-dumbbell',
  fitness_equipment: 'fas fa-dumbbell',
  strength_training: 'fas fa-dumbbell',
  rowing_machine: 'fas fa-dumbbell',
  cardio_training: 'fas fa-heart-pulse',
  stretching: 'fas fa-spa',
  pilates: 'fas fa-spa',
  yoga: 'fas fa-person-praying',
  stair_climbing: 'fas fa-stairs',
  // Swimming
  swimming: 'fas fa-person-swimming',
  pool_swimming: 'fas fa-person-swimming',
  open_water_swimming: 'fas fa-person-swimming',
  // Walking & hiking
  walking: 'fas fa-person-walking',
  hiking: 'fas fa-person-hiking',
  snowshoeing: 'fas fa-person-hiking',
  // Winter
  winter_sports: 'fas fa-snowflake',
  snowboarding: 'fas fa-person-snowboarding',
  backcountry_skiing: 'fas fa-person-skiing',
  alpine_skiing: 'fas fa-person-skiing',
  skiing: 'fas fa-person-skiing',
  cross_country_skiing: 'fas fa-person-skiing-nordic',
  ice_skating: 'fas fa-person-skating',
  inline_skating: 'fas fa-person-skating',
  // Water
  water_sports: 'fas fa-water',
  kayaking: 'fas fa-water',
  canoeing: 'fas fa-water',
  canoeing_kayaking: 'fas fa-water',
  paddling: 'fas fa-water',
  stand_up_paddleboarding: 'fas fa-water',
  surfing: 'fas fa-water',
  wakeboarding: 'fas fa-water',
  water_skiing: 'fas fa-water',
  diving: 'fas fa-water',
  rowing: 'fas fa-water',
  windsurfing: 'fas fa-wind',
  kitesurfing: 'fas fa-wind',
  boating: 'fas fa-sailboat',
  sailing: 'fas fa-sailboat',
  fishing: 'fas fa-fish-fins',
  // Multisport
  transition: 'fas fa-arrows-rotate',
  // Team sports
  team_sports: 'fas fa-people-group',
  american_football: 'fas fa-football',
  rugby: 'fas fa-football',
  baseball: 'fas fa-baseball-bat-ball',
  basketball: 'fas fa-basketball',
  hockey: 'fas fa-hockey-puck',
  soccer: 'fas fa-futbol',
  volleyball: 'fas fa-volleyball',
  // Racket sports
  racket_sports: 'fas fa-table-tennis-paddle-ball',
  table_tennis: 'fas fa-table-tennis-paddle-ball',
  // Other
  boxing: 'fas fa-hand-fist',
  martial_arts: 'fas fa-hand-fist',
  dance: 'fas fa-music',
  golf: 'fas fa-golf-ball-tee',
  mountaineering: 'fas fa-mountain-sun',
  rock_climbing: 'fas fa-mountain',
  para_sports: 'fas fa-wheelchair-move',
  wheelchair: 'fas fa-wheelchair-move'
}

/** Get the FA icon class for a sport slug, with a generic fallback. */
export function getSportIcon(sport: string): string {
  return SPORT_ICONS[sport?.toLowerCase()] ?? 'fas fa-medal'
}
