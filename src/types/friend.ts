export interface Friend {
  id: string // unique friend ID (hash of their public URL for backwards compat)
  userId?: string // stable user ID from their manifest (new: user_xxx format)
  username: string // display name
  profilePhoto?: string // base64 encoded image
  bio?: string // optional bio
  publicUrl: string // manifest.json URL on their Google Drive
  addedAt: number // timestamp when friend was added
  lastFetched?: number // last successful fetch timestamp
  lastModified?: number // for IndexedDB sync
  syncEnabled: boolean // allow pausing sync for specific friend
  lastSyncTime?: number | null // last sync timestamp
  fullySynced?: boolean // true if all years have been synced
  followsMe?: boolean // true if this friend has us in their "following" list (mutual friendship)
  /**
   * The key their public files are sealed with, from the `#k=` of the link they
   * shared. Absent for a profile published unsealed (before encryption existed).
   */
  shareKey?: string
}

export interface FriendActivity {
  id: string // composite: `${friendId}_${activityId}_${year}`
  friendId: string // reference to Friend
  friendUsername: string // denormalized for display
  activityId: string // original activity ID
  year: number // year of activity (for lazy loading)
  // Activity fields (subset, no sensitive data)
  startTime: number // unix timestamp
  duration: number // in seconds
  distance: number // in meters
  type: string // 'run' | 'bike' | 'hike' etc
  title?: string // optional activity title
  mapPolyline?: [number, number][] // reduced GPS track (80% of points)
  photos?: PublicPhoto[] // the photos the friend shares, when they do
  // Metadata
  lastModified?: number // for IndexedDB sync
  fetchedAt: number // when this was fetched
}

export interface PublicManifest {
  version: 1
  lastModified: number // timestamp of last update
  profile: {
    userId?: string // stable user ID (user_xxx format) - new in v1.1
    username: string
    profilePhoto?: string // base64 encoded
    bio?: string
  }
  stats: {
    totalActivities: number
    totalDistance: number // in meters
    totalDuration: number // in seconds
  }
  availableYears: Array<{
    year: number
    fileUrl: string // Public URL for activities-YYYY.json
    activityCount: number
    lastModified: number
    /**
     * Public URL for activity-details-YYYY.json: the figures and charts the
     * owner chose to share (see `SharingSettings`). Fetched only when a friend
     * opens one of these outings; absent when nothing beyond the summary is shared.
     */
    detailsUrl?: string
  }>
  // Interaction years (likes/comments)
  availableInteractionYears?: Array<{
    year: number
    fileUrl: string // Public URL for interactions-YYYY.json
    lastModified: number
  }>
  // List of users this person follows (for mutual friendship detection)
  following?: Array<{
    userId: string // stable user ID of the person followed
    since: number // timestamp when added
  }>
}

export interface PublicActivity {
  id: string
  startTime: number
  duration: number
  distance: number
  type: string
  title?: string
  mapPolyline?: [number, number][] // reduced GPS track
  /** The outing's photos, when its owner shares them (`SharingSettings.photos`). */
  photos?: PublicPhoto[]
  // NO: detailed samples, heart rate zones, laps, cadence details
}

/**
 * A shared photo: two public files, sealed like every other one, each holding
 * a `PublicImage`. Listed in the year file rather than the details file, so a
 * friend's feed can show it without opening the outing.
 */
export interface PublicPhoto {
  id: string
  thumb: string
  full: string
  width: number
  height: number
}

/** The content of a shared photo's file: the image, as base64. */
export interface PublicImage {
  mime: string
  data: string
}

/** What one outing shares beyond its summary, per the owner's sharing settings. */
export interface PublicActivityDetails {
  stats?: NonNullable<import('./activity').ActivityDetails['stats']>
  samples?: import('./activity').Sample[]
}

/** activity-details-YYYY.json */
export interface YearActivityDetails {
  year: number
  activities: Record<string, PublicActivityDetails>
}

export interface YearActivities {
  year: number
  activities: PublicActivity[]
}

export interface FriendSyncResult {
  friendId: string
  success: boolean
  error?: string
  activitiesAdded: number
  totalActivities?: number // total activities fetched (for full sync)
  lastFetched: number
  timestamp: number // timestamp of sync operation
}

/**
 * Events emitted by FriendService
 */
export interface FriendServiceEvent {
  type:
    | 'friend-added'
    | 'friend-updated'
    | 'friend-removed'
    | 'sync-completed'
    | 'publish-completed'
    | 'publish-warning'
    | 'publish-error'
    | 'friend-error'
    | 'refresh-completed'
    | 'mutual-friendship-discovered'
  friend?: Friend
  syncResult?: FriendSyncResult
  publishUrl?: string
  /**
   * i18n key under `friendEvents.*`. Services must not carry display strings —
   * they cannot know the user's locale, and for a long time every one of these
   * was hardcoded French shown to English users.
   */
  messageKey?: string
  messageParams?: Record<string, unknown>
  /** Plural count, when the message has singular and plural forms */
  messageCount?: number
  messageType?: 'success' | 'error' | 'warning' | 'info'
}
