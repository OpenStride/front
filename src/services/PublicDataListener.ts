/**
 * PublicDataListener - Auto-publish activities when new data arrives
 *
 * Subscribes to ActivityService events and automatically publishes
 * the user's public data when activities are saved/updated/deleted.
 *
 * Uses debouncing to avoid excessive publishes when importing many activities.
 */

import { getActivityService, type ActivityServiceEvent } from './ActivityService'
import { PublicDataService } from './PublicDataService'
import { PublicFileService } from './PublicFileService'
import { IndexedDBService } from './IndexedDBService'
import { debounce } from '@/utils/debounce'

export class PublicDataListener {
  private static instance: PublicDataListener
  private activityServiceListener: ((evt: Event) => void) | null = null
  private debouncedPublish: (() => void) | null = null
  private isPublishing = false
  public emitter = new EventTarget()

  private constructor() {}

  public static getInstance(): PublicDataListener {
    if (!PublicDataListener.instance) {
      PublicDataListener.instance = new PublicDataListener()
    }
    return PublicDataListener.instance
  }

  /**
   * Start listening to ActivityService events
   * Call this once during app bootstrap (after checking if auto-publish is enabled)
   */
  async startListening(): Promise<void> {
    // Check if auto-publish is enabled
    const db = await IndexedDBService.getInstance()
    const autoPublishEnabled = await db.getData('autoPublishEnabled')

    if (!autoPublishEnabled) {
      console.log('[PublicDataListener] Auto-publish disabled, not starting listener')
      return
    }

    // Check if we have a storage plugin that supports public files
    const publicFileService = PublicFileService.getInstance()
    const hasSupport = await publicFileService.hasPublicFileSupport()

    if (!hasSupport) {
      console.log('[PublicDataListener] No storage plugin with public file support, not starting')
      return
    }

    const activityService = await getActivityService()

    // Create debounced publish function (5 seconds delay)
    // This prevents excessive publishing when importing many activities at once
    this.debouncedPublish = debounce(() => {
      this.publishNow()
    }, 5000)

    this.activityServiceListener = (evt: Event) => {
      const e = evt as CustomEvent<ActivityServiceEvent>
      const { type, activity } = e.detail

      console.log(`[PublicDataListener] Activity ${type}: ${activity.id}`)

      // Trigger debounced publish for any activity change
      if (this.debouncedPublish) {
        this.debouncedPublish()
      }
    }

    activityService.emitter.addEventListener('activity-changed', this.activityServiceListener)
    console.log('[PublicDataListener] Started listening to ActivityService events')
  }

  /**
   * Stop listening to ActivityService events
   */
  async stopListening(): Promise<void> {
    if (this.activityServiceListener) {
      const activityService = await getActivityService()
      activityService.emitter.removeEventListener('activity-changed', this.activityServiceListener)
      this.activityServiceListener = null
      this.debouncedPublish = null
      console.log('[PublicDataListener] Stopped listening')
    }
  }

  /**
   * Publish public data now (called by debounced function or manually)
   */
  async publishNow(): Promise<{ success: boolean; error?: string }> {
    if (this.isPublishing) {
      console.log('[PublicDataListener] Already publishing, skipping')
      return { success: false, error: 'Already publishing' }
    }

    this.isPublishing = true
    this.emitter.dispatchEvent(new CustomEvent('publish-started'))

    try {
      const publicDataService = PublicDataService.getInstance()
      const publicFileService = PublicFileService.getInstance()
      const db = await IndexedDBService.getInstance()

      // Generate all public data
      const { manifest, yearFiles } = await publicDataService.generateAllPublicData()

      // Upload year files and get URLs
      for (const [year, yearData] of yearFiles.entries()) {
        const filename = `openstride-activities-${year}.json`
        const url = await publicFileService.writePublicFile(filename, yearData)

        if (url) {
          // Update manifest with file URL
          const yearEntry = manifest.availableYears.find(y => y.year === year)
          if (yearEntry) {
            yearEntry.fileUrl = url
          }
        }
      }

      // Upload manifest
      const manifestUrl = await publicFileService.writePublicFile(
        'openstride-manifest.json',
        manifest
      )

      if (manifestUrl) {
        // Save manifest URL for sharing
        await db.saveData('publicManifestUrl', manifestUrl)

        console.log('[PublicDataListener] Published successfully:', manifestUrl)
        this.emitter.dispatchEvent(
          new CustomEvent('publish-completed', {
            detail: { manifestUrl, activitiesCount: manifest.stats.totalActivities }
          })
        )

        return { success: true }
      } else {
        throw new Error('Failed to upload manifest')
      }
    } catch (err: any) {
      console.error('[PublicDataListener] Publish failed:', err)
      this.emitter.dispatchEvent(
        new CustomEvent('publish-failed', {
          detail: { error: err.message }
        })
      )
      return { success: false, error: err.message }
    } finally {
      this.isPublishing = false
    }
  }

  /**
   * Enable auto-publish and start listening
   */
  async enableAutoPublish(): Promise<void> {
    const db = await IndexedDBService.getInstance()
    await db.saveData('autoPublishEnabled', true)
    await this.startListening()
  }

  /**
   * Disable auto-publish and stop listening
   */
  async disableAutoPublish(): Promise<void> {
    const db = await IndexedDBService.getInstance()
    await db.saveData('autoPublishEnabled', false)
    await this.stopListening()
  }

  /**
   * Check if auto-publish is currently enabled
   */
  async isAutoPublishEnabled(): Promise<boolean> {
    const db = await IndexedDBService.getInstance()
    return (await db.getData('autoPublishEnabled')) === true
  }
}

// Export singleton getter
export function getPublicDataListener(): PublicDataListener {
  return PublicDataListener.getInstance()
}
