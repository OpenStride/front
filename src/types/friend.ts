export interface Friend {
  id: string;                    // unique friend ID (hash of their public URL)
  username: string;              // display name
  profilePhoto?: string;         // base64 encoded image
  bio?: string;                  // optional bio
  publicUrl: string;             // manifest.json URL on their Google Drive
  addedAt: number;              // timestamp when friend was added
  lastFetched?: number;         // last successful fetch timestamp
  lastModified?: number;        // for IndexedDB sync
  syncEnabled: boolean;         // allow pausing sync for specific friend
  lastSyncTime?: number | null; // last sync timestamp
  fullySynced?: boolean;        // true if all years have been synced
}

export interface FriendActivity {
  id: string;                   // composite: `${friendId}_${activityId}_${year}`
  friendId: string;             // reference to Friend
  friendUsername: string;       // denormalized for display
  activityId: string;           // original activity ID
  year: number;                 // year of activity (for lazy loading)
  // Activity fields (subset, no sensitive data)
  startTime: number;            // unix timestamp
  duration: number;             // in seconds
  distance: number;             // in meters
  type: string;                 // 'run' | 'bike' | 'hike' etc
  title?: string;               // optional activity title
  mapPolyline?: [number, number][]; // reduced GPS track (80% of points)
  // Metadata
  lastModified?: number;        // for IndexedDB sync
  fetchedAt: number;            // when this was fetched
}

export interface PublicManifest {
  version: 1;
  lastModified: number;         // timestamp of last update
  profile: {
    username: string;
    profilePhoto?: string;      // base64 encoded
    bio?: string;
  };
  stats: {
    totalActivities: number;
    totalDistance: number;      // in meters
    totalDuration: number;      // in seconds
  };
  availableYears: Array<{
    year: number;
    fileUrl: string;            // Google Drive public URL for activities-YYYY.json
    activityCount: number;
    lastModified: number;
  }>;
}

export interface PublicActivity {
  id: string;
  startTime: number;
  duration: number;
  distance: number;
  type: string;
  title?: string;
  mapPolyline?: [number, number][]; // reduced GPS track
  // NO: detailed samples, heart rate zones, laps, cadence details
}

export interface YearActivities {
  year: number;
  activities: PublicActivity[];
}

export interface FriendSyncResult {
  friendId: string;
  success: boolean;
  error?: string;
  activitiesAdded: number;
  totalActivities?: number;     // total activities fetched (for full sync)
  lastFetched: number;
  timestamp: number;            // timestamp of sync operation
}

/**
 * Events emitted by FriendService
 */
export interface FriendServiceEvent {
  type: 'friend-added' | 'friend-removed' | 'sync-completed' | 'publish-completed' |
        'publish-warning' | 'publish-error' | 'friend-error' | 'refresh-completed';
  friend?: Friend;
  syncResult?: FriendSyncResult;
  publishUrl?: string;
  message?: string;
  messageType?: 'success' | 'error' | 'warning' | 'info';
}
