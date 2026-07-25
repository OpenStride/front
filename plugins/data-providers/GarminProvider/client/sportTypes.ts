// Garmin activityType → OpenStride sport slug.
//
// Ported from Garmin's Health API Specification, Appendix A (activity types).
// Garmin exposes ~150 granular types; we collapse them onto clean snake_case
// slugs that `formatSportType` humanises for display and that drive icons/filters.
// _V2 variants map to the same slug as their base. Unknown types → 'other'.
const GARMIN_SPORT_MAP: Record<string, string> = {
  // Running
  RUNNING: 'running',
  INDOOR_RUNNING: 'treadmill_running',
  OBSTACLE_RUN: 'running',
  STREET_RUNNING: 'running',
  TRACK_RUNNING: 'running',
  TRAIL_RUNNING: 'trail_running',
  TREADMILL_RUNNING: 'treadmill_running',
  ULTRA_RUN: 'running',
  VIRTUAL_RUN: 'running',
  // Cycling
  CYCLING: 'cycling',
  BMX: 'cycling',
  CYCLOCROSS: 'cyclocross',
  DOWNHILL_BIKING: 'mountain_biking',
  E_BIKE_FITNESS: 'e_biking',
  E_BIKE_MOUNTAIN: 'e_biking',
  E_ENDURO_MTB: 'e_biking',
  ENDURO_MTB: 'mountain_biking',
  GRAVEL_CYCLING: 'cycling',
  INDOOR_CYCLING: 'indoor_cycling',
  MOUNTAIN_BIKING: 'mountain_biking',
  RECUMBENT_CYCLING: 'cycling',
  ROAD_BIKING: 'cycling',
  TRACK_CYCLING: 'cycling',
  VIRTUAL_RIDE: 'indoor_cycling',
  HANDCYCLING: 'cycling',
  INDOOR_HANDCYCLING: 'indoor_cycling',
  // Gym & fitness equipment
  FITNESS_EQUIPMENT: 'fitness_equipment',
  BOULDERING: 'indoor_climbing',
  ELLIPTICAL: 'elliptical',
  INDOOR_CARDIO: 'cardio_training',
  HIIT: 'cardio_training',
  INDOOR_CLIMBING: 'indoor_climbing',
  INDOOR_ROWING: 'rowing_machine',
  MOBILITY: 'stretching',
  PILATES: 'pilates',
  STAIR_CLIMBING: 'stair_climbing',
  STRENGTH_TRAINING: 'strength_training',
  YOGA: 'yoga',
  MEDITATION: 'stretching',
  // Swimming
  SWIMMING: 'swimming',
  LAP_SWIMMING: 'pool_swimming',
  OPEN_WATER_SWIMMING: 'open_water_swimming',
  // Walking & hiking
  WALKING: 'walking',
  CASUAL_WALKING: 'walking',
  SPEED_WALKING: 'walking',
  HIKING: 'hiking',
  RUCKING: 'hiking',
  // Winter sports
  WINTER_SPORTS: 'winter_sports',
  BACKCOUNTRY_SNOWBOARDING: 'snowboarding',
  BACKCOUNTRY_SKIING: 'backcountry_skiing',
  CROSS_COUNTRY_SKIING_WS: 'cross_country_skiing',
  RESORT_SKIING: 'alpine_skiing',
  SNOWBOARDING_WS: 'snowboarding',
  RESORT_SKIING_SNOWBOARDING_WS: 'alpine_skiing',
  SKATE_SKIING_WS: 'cross_country_skiing',
  SKATING_WS: 'ice_skating',
  SNOW_SHOE_WS: 'snowshoeing',
  SNOWMOBILING_WS: 'snowmobiling',
  // Water sports
  WATER_SPORTS: 'water_sports',
  BOATING: 'boating',
  FISHING: 'fishing',
  KAYAKING: 'kayaking',
  KITEBOARDING: 'kitesurfing',
  OFFSHORE_GRINDING: 'sailing',
  ONSHORE_GRINDING: 'sailing',
  PADDLING: 'paddling',
  ROWING: 'rowing',
  SAILING: 'sailing',
  SNORKELING: 'diving',
  STAND_UP_PADDLEBOARDING: 'stand_up_paddleboarding',
  SURFING: 'surfing',
  WAKEBOARDING: 'wakeboarding',
  WATERSKIING: 'water_skiing',
  WHITEWATER_RAFTING: 'kayaking',
  WINDSURFING: 'windsurfing',
  // Transitions
  TRANSITION: 'transition',
  BIKE_TO_RUN_TRANSITION: 'transition',
  RUN_TO_BIKE_TRANSITION: 'transition',
  SWIM_TO_BIKE_TRANSITION: 'transition',
  // Team sports
  TEAM_SPORTS: 'team_sports',
  AMERICAN_FOOTBALL: 'american_football',
  BASEBALL: 'baseball',
  BASKETBALL: 'basketball',
  CRICKET: 'cricket',
  FIELD_HOCKEY: 'hockey',
  ICE_HOCKEY: 'hockey',
  LACROSSE: 'lacrosse',
  RUGBY: 'rugby',
  SOCCER: 'soccer',
  SOFTBALL: 'baseball',
  ULTIMATE_DISC: 'disc_sports',
  VOLLEYBALL: 'volleyball',
  // Racket sports
  RACKET_SPORTS: 'racket_sports',
  BADMINTON: 'badminton',
  PADDELBALL: 'padel', // Garmin spells Padel "PADDELBALL"
  PICKLEBALL: 'pickleball',
  PLATFORM_TENNIS: 'tennis',
  RACQUETBALL: 'racquetball',
  SQUASH: 'squash',
  TABLE_TENNIS: 'table_tennis',
  TENNIS: 'tennis',
  // Other
  OTHER: 'other',
  BOXING: 'boxing',
  BREATHWORK: 'stretching',
  DANCE: 'dance',
  DISC_GOLF: 'disc_sports',
  FLOOR_CLIMBING: 'stair_climbing',
  GOLF: 'golf',
  INLINE_SKATING: 'inline_skating',
  JUMP_ROPE: 'cardio_training',
  MIXED_MARTIAL_ARTS: 'martial_arts',
  MOUNTAINEERING: 'mountaineering',
  ROCK_CLIMBING: 'rock_climbing',
  STOP_WATCH: 'other',
  PARA_SPORTS: 'para_sports',
  WHEELCHAIR_PUSH_RUN: 'running',
  WHEELCHAIR_PUSH_WALK: 'walking'
}

/**
 * Map a raw Garmin activityType to an OpenStride sport slug.
 * Handles _V2 variants and unknown values (→ 'other').
 */
export function mapGarminSport(activityType: unknown): string {
  if (typeof activityType !== 'string' || !activityType) return 'other'
  const normalized = activityType.toUpperCase().trim().replace(/_V2$/, '')
  return GARMIN_SPORT_MAP[normalized] ?? 'other'
}
