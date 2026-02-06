const SPORT_LABELS: Record<string, string> = {
  RUNNING: 'Course a pied',
  RUN: 'Course a pied',
  run: 'Course a pied',
  CYCLING: 'Velo',
  bike: 'Velo',
  SWIMMING: 'Natation',
  swim: 'Natation',
  WALKING: 'Marche',
  walk: 'Marche',
  HIKING: 'Randonnee',
  hike: 'Randonnee',
  YOGA: 'Yoga',
  TRAIL_RUNNING: 'Trail',
  trail_running: 'Trail'
}

export function formatSportType(sport: string): string {
  return SPORT_LABELS[sport] || sport.charAt(0).toUpperCase() + sport.slice(1).toLowerCase()
}
