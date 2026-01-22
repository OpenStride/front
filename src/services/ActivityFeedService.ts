/**
 * ActivityFeedService - Business logic for loading and preparing feed activities
 *
 * Responsible for:
 * - Loading activities from IndexedDB
 * - Transforming data into feed format
 * - Merging and sorting activities
 */

import { IndexedDBService } from '@/services/IndexedDBService'
import type { Activity } from '@/types/activity'
import type { FriendActivity } from '@/types/friend'

export interface FeedActivity extends Activity {
  source: 'own' | 'friend'
  friendId?: string
  friendUsername?: string
}

export class ActivityFeedService {
  private static instance: ActivityFeedService

  private constructor() {}

  public static getInstance(): ActivityFeedService {
    if (!ActivityFeedService.instance) {
      ActivityFeedService.instance = new ActivityFeedService()
    }
    return ActivityFeedService.instance
  }

  /**
   * Transform own activity to feed activity format
   */
  private transformOwnActivity(activity: Activity): FeedActivity {
    return {
      ...activity,
      source: 'own' as const
    }
  }

  /**
   * Transform friend activity to feed activity format
   */
  private transformFriendActivity(activity: FriendActivity): FeedActivity {
    return {
      id: activity.activityId, // Use original activity ID for routing
      provider: `friend_${activity.friendId}`,
      startTime: activity.startTime,
      duration: activity.duration,
      distance: activity.distance,
      type: activity.type,
      title: activity.title,
      mapPolyline: activity.mapPolyline,
      source: 'friend' as const,
      friendId: activity.friendId,
      friendUsername: activity.friendUsername
    }
  }

  /**
   * Sort activities by startTime descending (newest first)
   */
  private sortActivities(activities: FeedActivity[]): FeedActivity[] {
    return activities.sort((a, b) => b.startTime - a.startTime)
  }

  /**
   * Load all activities (own + friends) and merge them
   * Returns sorted feed activities
   */
  public async loadAllActivities(): Promise<FeedActivity[]> {
    const db = await IndexedDBService.getInstance()

    // Load own activities
    const ownActivities: Activity[] = await db.getAllData('activities')
    const ownFeedActivities = ownActivities.map(a => this.transformOwnActivity(a))

    // Load friend activities
    const friendActivities: FriendActivity[] = await db.getAllData('friend_activities')
    const friendFeedActivities = friendActivities.map(a => this.transformFriendActivity(a))

    // Merge and sort
    const allActivities = [...ownFeedActivities, ...friendFeedActivities]
    return this.sortActivities(allActivities)
  }

  /**
   * Get activity counts by source
   */
  public getActivityCounts(activities: FeedActivity[]): {
    own: number
    friends: number
    total: number
  } {
    return {
      own: activities.filter(a => a.source === 'own').length,
      friends: activities.filter(a => a.source === 'friend').length,
      total: activities.length
    }
  }
}
