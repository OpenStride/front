import { IndexedDBService } from './IndexedDBService';
import type { Activity, ActivityDetails } from '@/types/activity';
import type { PublicManifest, PublicActivity, YearActivities } from '@/types/friend';

export class PublicDataService {
  private static instance: PublicDataService;

  private constructor() {}

  public static getInstance(): PublicDataService {
    if (!PublicDataService.instance) {
      PublicDataService.instance = new PublicDataService();
    }
    return PublicDataService.instance;
  }

  /**
   * Check if an activity should be public based on default privacy + per-activity override
   */
  private async isActivityPublic(activityId: string): Promise<boolean> {
    const db = await IndexedDBService.getInstance();

    // Check for per-activity override
    const override = await db.getData(`activityPrivacy_${activityId}`);
    if (override !== null && override !== undefined) {
      return override === true || override === 'public';
    }

    // Fall back to default privacy setting
    const defaultPrivacy = await db.getData('defaultPrivacy');
    return defaultPrivacy === 'public';
  }

  /**
   * Reduce GPS track to 80% of points using simple regular sampling
   */
  private reduceGPSTrack(polyline?: [number, number][]): [number, number][] | undefined {
    if (!polyline || polyline.length === 0) return undefined;

    const targetCount = Math.ceil(polyline.length * 0.8);
    if (targetCount >= polyline.length) return polyline;

    const step = polyline.length / targetCount;
    const reduced: [number, number][] = [];

    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * step);
      reduced.push(polyline[index]);
    }

    // Always include last point to close the track properly
    if (reduced[reduced.length - 1] !== polyline[polyline.length - 1]) {
      reduced.push(polyline[polyline.length - 1]);
    }

    return reduced;
  }

  /**
   * Convert Activity to PublicActivity format (sanitized)
   */
  private toPublicActivity(activity: Activity): PublicActivity {
    return {
      id: activity.id,
      startTime: activity.startTime,
      duration: activity.duration,
      distance: activity.distance,
      type: activity.type,
      title: activity.title,
      mapPolyline: this.reduceGPSTrack(activity.mapPolyline)
    };
  }

  /**
   * Generate public activities grouped by year
   */
  public async generateYearFiles(): Promise<Map<number, YearActivities>> {
    const db = await IndexedDBService.getInstance();
    const allActivities: Activity[] = await db.getAllData('activities');

    // Filter only public activities
    const publicActivities: Activity[] = [];
    for (const activity of allActivities) {
      const isPublic = await this.isActivityPublic(activity.id);
      if (isPublic) {
        publicActivities.push(activity);
      }
    }

    // Group by year
    const yearMap = new Map<number, PublicActivity[]>();
    for (const activity of publicActivities) {
      const year = new Date(activity.startTime * 1000).getFullYear();
      if (!yearMap.has(year)) {
        yearMap.set(year, []);
      }
      yearMap.get(year)!.push(this.toPublicActivity(activity));
    }

    // Convert to YearActivities format
    const result = new Map<number, YearActivities>();
    for (const [year, activities] of yearMap.entries()) {
      // Sort by startTime descending (newest first)
      activities.sort((a, b) => b.startTime - a.startTime);
      result.set(year, { year, activities });
    }

    return result;
  }

  /**
   * Generate the public manifest with profile and year index
   * Note: fileUrls will be populated after upload by the caller
   */
  public async generateManifest(yearFiles: Map<number, YearActivities>): Promise<PublicManifest> {
    const db = await IndexedDBService.getInstance();

    // Get profile info from settings
    const username = await db.getData('username') || 'OpenStride User';
    const profilePhoto = await db.getData('profilePhoto');
    const bio = await db.getData('bio');

    // Calculate global stats
    let totalActivities = 0;
    let totalDistance = 0;
    let totalDuration = 0;

    for (const yearData of yearFiles.values()) {
      totalActivities += yearData.activities.length;
      for (const activity of yearData.activities) {
        totalDistance += activity.distance;
        totalDuration += activity.duration;
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
      .sort((a, b) => b.year - a.year); // Newest year first

    return {
      version: 1,
      lastModified: Date.now(),
      profile: {
        username,
        profilePhoto,
        bio
      },
      stats: {
        totalActivities,
        totalDistance,
        totalDuration
      },
      availableYears
    };
  }

  /**
   * Main method: Generate all public data ready for publishing
   */
  public async generateAllPublicData(): Promise<{
    manifest: PublicManifest;
    yearFiles: Map<number, YearActivities>;
  }> {
    const yearFiles = await this.generateYearFiles();
    const manifest = await this.generateManifest(yearFiles);

    return { manifest, yearFiles };
  }
}
