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

/** Font Awesome icon class by sport slug */
export const SPORT_ICONS: Record<string, string> = {
  running: 'fas fa-person-running',
  treadmill_running: 'fas fa-person-running',
  trail_running: 'fas fa-person-running',
  cycling: 'fas fa-person-biking',
  indoor_cycling: 'fas fa-person-biking',
  mountain_biking: 'fas fa-person-biking',
  e_biking: 'fas fa-person-biking',
  swimming: 'fas fa-person-swimming',
  pool_swimming: 'fas fa-person-swimming',
  open_water_swimming: 'fas fa-person-swimming',
  walking: 'fas fa-person-walking',
  hiking: 'fas fa-person-hiking',
  yoga: 'fas fa-person-praying',
  strength_training: 'fas fa-dumbbell',
  skiing: 'fas fa-person-skiing',
  alpine_skiing: 'fas fa-person-skiing',
  cross_country_skiing: 'fas fa-person-skiing-nordic',
  snowboarding: 'fas fa-person-snowboarding'
}

/** Get the FA icon class for a sport slug, with fallback */
export function getSportIcon(sport: string): string {
  return SPORT_ICONS[sport?.toLowerCase()] ?? 'fas fa-medal'
}
