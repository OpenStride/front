import type { Activity, ActivityDetails, Sample } from '@/types/activity'
import type { Friend, FriendActivity, PublicManifest, PublicActivity, YearActivities } from '@/types/friend'

/**
 * Test fixtures for activities, details, and friends
 * Used across unit tests for consistency
 */

// Base timestamp for consistent test data
const BASE_TIME = new Date('2026-01-15T08:00:00Z').getTime()

/**
 * Sample GPS points simulating a 5km run in Paris
 */
export const createSampleGPSTrack = (numPoints = 100): Sample[] => {
  const samples: Sample[] = []
  const startLat = 48.8566 // Paris center
  const startLng = 2.3522

  for (let i = 0; i < numPoints; i++) {
    const timeOffset = i * 30 // 30 seconds between points
    const progress = i / numPoints

    samples.push({
      time: timeOffset,
      distance: progress * 5000, // 5km total
      lat: startLat + (Math.random() - 0.5) * 0.02,
      lng: startLng + (Math.random() - 0.5) * 0.02,
      elevation: 50 + Math.sin(progress * Math.PI) * 20, // Gentle hill
      heartRate: 140 + Math.sin(progress * Math.PI * 2) * 15, // Variable HR
      cadence: 170 + Math.random() * 10,
      speed: 3.33 + Math.random() * 0.5 // ~3:20-3:50 min/km
    })
  }

  return samples
}

/**
 * Create a basic activity with versioning
 */
export const createActivity = (overrides?: Partial<Activity>): Activity => ({
  id: 'activity-1',
  provider: 'garmin',
  startTime: BASE_TIME,
  duration: 1800, // 30 minutes
  distance: 5000, // 5km
  type: 'run',
  title: 'Morning Run',
  version: 1,
  lastModified: BASE_TIME,
  synced: false,
  deleted: false,
  mapPolyline: [
    [48.8566, 2.3522],
    [48.8576, 2.3532],
    [48.8586, 2.3542]
  ],
  ...overrides
})

/**
 * Create activity details with samples
 */
export const createActivityDetails = (
  activityId = 'activity-1',
  numSamples = 100,
  overrides?: Partial<ActivityDetails>
): ActivityDetails => ({
  id: activityId,
  version: 1,
  lastModified: BASE_TIME,
  synced: false,
  deleted: false,
  samples: createSampleGPSTrack(numSamples),
  laps: [
    { time: 0, duration: 900, distance: 2500 },
    { time: 900, duration: 900, distance: 2500 }
  ],
  stats: {
    averageHeartRate: 145,
    maxHeartRate: 165,
    averageSpeed: 2.78, // 3:36 min/km
    maxSpeed: 3.5,
    averageCadence: 175,
    totalAscent: 50,
    calories: 350
  },
  notes: 'Great morning run!',
  ...overrides
})

/**
 * Create a friend record
 */
export const createFriend = (overrides?: Partial<Friend>): Friend => ({
  id: 'friend-1',
  username: 'John Doe',
  publicUrl: 'https://drive.google.com/file/d/abc123/view',
  addedAt: BASE_TIME,
  lastFetched: BASE_TIME,
  lastSyncTime: BASE_TIME,
  syncEnabled: true,
  fullySynced: false,
  ...overrides
})

/**
 * Batch create multiple activities
 */
export const createActivities = (count: number, baseTime: number = BASE_TIME): Activity[] => {
  const activities: Activity[] = []

  for (let i = 0; i < count; i++) {
    const dayOffset = i * 24 * 60 * 60 * 1000 // One activity per day
    activities.push(
      createActivity({
        id: `activity-${i + 1}`,
        startTime: baseTime + dayOffset,
        lastModified: baseTime + dayOffset,
        title: `Run ${i + 1}`,
        distance: 5000 + (i * 100), // Gradually increasing distance
        duration: 1800 + (i * 10)
      })
    )
  }

  return activities
}

/**
 * Batch create activity details
 */
export const createActivitiesDetails = (
  activityIds: string[],
  baseTime: number = BASE_TIME
): ActivityDetails[] => {
  return activityIds.map((id, index) => {
    const dayOffset = index * 24 * 60 * 60 * 1000
    return createActivityDetails(id, 50, {
      lastModified: baseTime + dayOffset
    })
  })
}

/**
 * Create conflicting activities (same id, different versions)
 */
export const createConflictingActivities = () => {
  const baseActivity = createActivity({ id: 'conflict-activity' })

  return {
    local: {
      ...baseActivity,
      title: 'Local Version',
      version: 2,
      lastModified: BASE_TIME + 1000,
      synced: false
    },
    remote: {
      ...baseActivity,
      title: 'Remote Version',
      version: 2,
      lastModified: BASE_TIME + 5000, // Remote is newer
      synced: true
    }
  }
}

/**
 * Create activities with different sync states
 */
export const createMixedSyncActivities = () => ({
  unsynced: createActivity({ id: 'unsynced-1', synced: false }),
  synced: createActivity({ id: 'synced-1', synced: true }),
  deleted: createActivity({ id: 'deleted-1', deleted: true, synced: false }),
  syncedDeleted: createActivity({ id: 'synced-deleted-1', deleted: true, synced: true })
})

/**
 * Create activities spanning different time periods
 */
export const createActivitiesByMonth = (year: number, month: number, count: number): Activity[] => {
  const baseTime = new Date(year, month - 1, 1).getTime()
  return createActivities(count, baseTime)
}

/**
 * Create a privacy-aware activity (for social features)
 */
export const createPrivateActivity = (overrides?: Partial<Activity>): Activity =>
  createActivity({
    id: 'private-activity',
    title: 'Private Run',
    ...overrides
  })

/**
 * Create a friend's public activity (FriendActivity type)
 */
export const createFriendActivity = (
  friendId = 'friend-1',
  activityId = 'activity-1',
  overrides?: Partial<FriendActivity>
): FriendActivity => ({
  id: `${friendId}_${activityId}_2026`,
  friendId,
  friendUsername: 'John Doe',
  activityId,
  year: 2026,
  startTime: BASE_TIME,
  duration: 1800,
  distance: 5000,
  type: 'run',
  title: "Friend's Morning Run",
  mapPolyline: [
    [48.8566, 2.3522],
    [48.8576, 2.3532]
  ],
  fetchedAt: BASE_TIME,
  lastModified: BASE_TIME,
  ...overrides
})

/**
 * Create a public manifest
 */
export const createPublicManifest = (overrides?: Partial<PublicManifest>): PublicManifest => ({
  version: 1,
  lastModified: BASE_TIME,
  profile: {
    username: 'John Doe',
    bio: 'Running enthusiast'
  },
  stats: {
    totalActivities: 42,
    totalDistance: 210000,
    totalDuration: 75600
  },
  availableYears: [
    {
      year: 2026,
      fileUrl: 'https://drive.google.com/file/d/activities-2026/view',
      activityCount: 15,
      lastModified: BASE_TIME
    },
    {
      year: 2025,
      fileUrl: 'https://drive.google.com/file/d/activities-2025/view',
      activityCount: 27,
      lastModified: BASE_TIME - 365 * 24 * 60 * 60 * 1000
    }
  ],
  ...overrides
})

/**
 * Create a public activity (subset of Activity)
 */
export const createPublicActivity = (overrides?: Partial<PublicActivity>): PublicActivity => ({
  id: 'public-activity-1',
  startTime: BASE_TIME,
  duration: 1800,
  distance: 5000,
  type: 'run',
  title: 'Morning Run',
  mapPolyline: [
    [48.8566, 2.3522],
    [48.8576, 2.3532]
  ],
  ...overrides
})

/**
 * Create year activities collection
 */
export const createYearActivities = (year = 2026, count = 10): YearActivities => ({
  year,
  activities: Array.from({ length: count }, (_, i) =>
    createPublicActivity({
      id: `activity-${i + 1}`,
      startTime: new Date(year, 0, i + 1).getTime()
    })
  )
})
