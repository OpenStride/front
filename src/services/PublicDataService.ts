import { IndexedDBService } from './IndexedDBService'
import { getInteractionService } from './InteractionService'
import type { Activity } from '@/types/activity'
import type { ActivityDetails } from '@/types/activity'
import type { PublicActivityDetails, YearActivityDetails } from '@/types/friend'
import {
  SHARED_STATS,
  SHARING_KEY,
  readSharing,
  shareSamples,
  trimTrack,
  type SharingSettings
} from '@/types/sharing'

/**
 * Noon of the outing's day, in the unit it was stored in: the day stays true,
 * the hour a reader leaves home does not travel.
 */
function noonOf(startTime: number): number {
  const ms = startTime < 1e11 ? startTime * 1000 : startTime
  const d = new Date(ms)
  d.setHours(12, 0, 0, 0)
  return startTime < 1e11 ? Math.floor(d.getTime() / 1000) : d.getTime()
}
import type { PublicManifest, PublicActivity, YearActivities, Friend } from '@/types/friend'

export class PublicDataService {
  private static instance: PublicDataService

  private constructor() {
    /* singleton */
  }

  public static getInstance(): PublicDataService {
    if (!PublicDataService.instance) {
      PublicDataService.instance = new PublicDataService()
    }
    return PublicDataService.instance
  }

  /**
   * Check if an activity should be public based on default privacy + per-activity override
   */
  private async isActivityPublic(activityId: string): Promise<boolean> {
    const db = await IndexedDBService.getInstance()

    // Check for per-activity override
    const override = await db.getData<boolean | string>(`activityPrivacy_${activityId}`)
    if (override !== null && override !== undefined) {
      return override === true || override === 'public'
    }

    // Fall back to default privacy setting
    const defaultPrivacy = await db.getData<string>('defaultPrivacy')
    return defaultPrivacy === 'public'
  }

  /**
   * Reduce GPS track to 80% of points using simple regular sampling
   */
  private reduceGPSTrack(polyline?: [number, number][]): [number, number][] | undefined {
    if (!polyline || polyline.length === 0) return undefined

    const targetCount = Math.ceil(polyline.length * 0.8)
    if (targetCount >= polyline.length) return polyline

    const step = polyline.length / targetCount
    const reduced: [number, number][] = []

    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * step)
      reduced.push(polyline[index])
    }

    // Always include last point to close the track properly
    if (reduced[reduced.length - 1] !== polyline[polyline.length - 1]) {
      reduced.push(polyline[polyline.length - 1])
    }

    return reduced
  }

  /**
   * Convert Activity to PublicActivity format (sanitized)
   */
  private toPublicActivity(activity: Activity, sharing: SharingSettings): PublicActivity {
    return {
      id: activity.id,
      startTime: sharing.time ? activity.startTime : noonOf(activity.startTime),
      duration: activity.duration,
      distance: activity.distance,
      type: activity.type,
      title: sharing.title ? activity.title : undefined,
      mapPolyline: sharing.map
        ? this.reduceGPSTrack(trimTrack(activity.mapPolyline, sharing.privacyZone))
        : undefined
    }
  }

  /** The reader's sharing settings, read whole (see `readSharing`). */
  public async getSharingSettings(): Promise<SharingSettings> {
    const db = await IndexedDBService.getInstance()
    return readSharing(await db.getData(SHARING_KEY))
  }

  /**
   * What each public outing shares beyond its summary, by year — empty when the
   * settings share nothing more. A friend fetches a year of it only when they
   * open one of its outings, so the feed's sync stays as light as before.
   */
  public async generateDetailFiles(
    yearFiles: Map<number, YearActivities>,
    sharing: SharingSettings
  ): Promise<Map<number, YearActivityDetails>> {
    const result = new Map<number, YearActivityDetails>()
    if (!sharing.figures && sharing.charts.length === 0) return result

    const db = await IndexedDBService.getInstance()
    for (const [year, data] of yearFiles) {
      const activities: Record<string, PublicActivityDetails> = {}
      for (const { id } of data.activities) {
        const details = (await db.getDataFromStore('activity_details', id)) as
          ActivityDetails | undefined
        if (!details) continue
        const entry: PublicActivityDetails = {}
        if (sharing.figures && details.stats) {
          const stats: Record<string, number> = {}
          for (const key of SHARED_STATS) {
            const v = details.stats[key]
            if (typeof v === 'number' && Number.isFinite(v)) stats[key] = v
          }
          if (Object.keys(stats).length) entry.stats = stats
        }
        const samples = shareSamples(details.samples ?? [], sharing.charts)
        if (samples.length) entry.samples = samples
        if (entry.stats || entry.samples) activities[id] = entry
      }
      if (Object.keys(activities).length) result.set(year, { year, activities })
    }
    return result
  }

  /**
   * How many activities a friend would actually receive.
   *
   * Answers this through the same predicate the publisher uses, so the number
   * on screen and the number uploaded cannot drift apart. It matters because
   * `defaultPrivacy` ships as `private`: publishing without touching it
   * produces a profile a friend can follow and find empty.
   */
  public async countPublicActivities(): Promise<number> {
    const db = await IndexedDBService.getInstance()
    const allActivities: Activity[] = await db.getAllData<Activity>('activities')

    let count = 0
    for (const activity of allActivities) {
      if (await this.isActivityPublic(activity.id)) count += 1
    }
    return count
  }

  /**
   * Generate public activities grouped by year
   */
  public async generateYearFiles(): Promise<Map<number, YearActivities>> {
    const db = await IndexedDBService.getInstance()
    const allActivities: Activity[] = await db.getAllData<Activity>('activities')

    // Filter only public activities
    const publicActivities: Activity[] = []
    for (const activity of allActivities) {
      const isPublic = await this.isActivityPublic(activity.id)
      if (isPublic) {
        publicActivities.push(activity)
      }
    }

    const sharing = await this.getSharingSettings()

    // Group by year
    const yearMap = new Map<number, PublicActivity[]>()
    for (const activity of publicActivities) {
      const year = new Date(activity.startTime * 1000).getFullYear()
      if (!yearMap.has(year)) {
        yearMap.set(year, [])
      }
      yearMap.get(year)!.push(this.toPublicActivity(activity, sharing))
    }

    // Convert to YearActivities format
    const result = new Map<number, YearActivities>()
    for (const [year, activities] of yearMap.entries()) {
      // Sort by startTime descending (newest first)
      activities.sort((a, b) => b.startTime - a.startTime)
      result.set(year, { year, activities })
    }

    return result
  }

  /**
   * Generate the public manifest with profile and year index
   * Note: fileUrls will be populated after upload by the caller
   */
  public async generateManifest(yearFiles: Map<number, YearActivities>): Promise<PublicManifest> {
    const db = await IndexedDBService.getInstance()
    const interactionService = getInteractionService()

    // Get or generate stable user ID (generated ONCE, stored permanently)
    const userId = await interactionService.generateAndStoreUserId()

    // Get profile info from settings
    const username = (await db.getData<string>('username')) || 'OpenStride User'
    const profilePhoto = (await db.getData<string>('profilePhoto')) ?? undefined
    const bio = (await db.getData<string>('bio')) ?? undefined

    // Calculate global stats
    let totalActivities = 0
    let totalDistance = 0
    let totalDuration = 0

    for (const yearData of yearFiles.values()) {
      totalActivities += yearData.activities.length
      for (const activity of yearData.activities) {
        totalDistance += activity.distance
        totalDuration += activity.duration
      }
    }

    // Build availableYears (URLs will be set after upload)
    const availableYears = Array.from(yearFiles.entries())
      .map(([year, data]) => ({
        year,
        fileUrl: '', // To be populated after upload
        activityCount: data.activities.length,
        lastModified: Date.now()
      }))
      .sort((a, b) => b.year - a.year) // Newest year first

    // Build following list (for mutual friendship detection)
    const friends = await db.getAllData<Friend>('friends')
    const following = friends
      .filter(f => f.userId) // Only include friends with stable userId
      .map(f => ({
        userId: f.userId!,
        since: f.addedAt
      }))

    return {
      version: 1,
      lastModified: Date.now(),
      profile: {
        userId, // Stable user ID for interactions
        username,
        profilePhoto,
        bio
      },
      stats: {
        totalActivities,
        totalDistance,
        totalDuration
      },
      availableYears,
      following: following.length > 0 ? following : undefined
    }
  }

  /**
   * Main method: Generate all public data ready for publishing
   */
  public async generateAllPublicData(): Promise<{
    manifest: PublicManifest
    yearFiles: Map<number, YearActivities>
    detailFiles: Map<number, YearActivityDetails>
  }> {
    const yearFiles = await this.generateYearFiles()
    const manifest = await this.generateManifest(yearFiles)
    const detailFiles = await this.generateDetailFiles(yearFiles, await this.getSharingSettings())

    return { manifest, yearFiles, detailFiles }
  }
}
