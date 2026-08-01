/**
 * PublicDataListener - Auto-publish activities when new data arrives
 *
 * Subscribes to ActivityService events and automatically publishes
 * the user's public data when activities are saved/updated/deleted.
 *
 * Delegates to FriendService.publishPublicData() for a single publish path
 * that includes activities, interactions, and the following list.
 *
 * Uses debouncing to avoid excessive publishes when importing many activities.
 */

import { getActivityService, type ActivityServiceEvent } from './ActivityService'
import { PublicFileService } from './PublicFileService'
import { IndexedDBService } from './IndexedDBService'
import { FriendService } from './FriendService'
import { debounce } from '@/utils/debounce'
import type { FriendServiceEvent } from '@/types/friend'

export class PublicDataListener {
  private static instance: PublicDataListener
  private activityServiceListener: ((evt: Event) => void) | null = null
  private friendsChangedListener: ((evt: Event) => void) | null = null
  private refreshRequestedListener: ((evt: Event) => void) | null = null
  private firstPublishListener: ((evt: Event) => void) | null = null
  private debouncedPublish: (() => void) | null = null
  private isPublishing = false
  private listening = false
  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static getInstance(): PublicDataListener {
    if (!PublicDataListener.instance) {
      PublicDataListener.instance = new PublicDataListener()
    }
    return PublicDataListener.instance
  }

  /**
   * Call this once during app bootstrap.
   *
   * Starts the listener when auto-publish is on, and — either way — watches for
   * the user's first successful publish so it can turn itself on. Publishing is
   * an explicit act; keeping it a one-shot afterwards was the reason friends
   * stopped seeing new activities the day after they were added.
   */
  async initialize(): Promise<void> {
    this.firstPublishListener = (evt: Event) => {
      const detail = (evt as CustomEvent<FriendServiceEvent>).detail
      if (detail?.type !== 'publish-completed') return
      this.enableAutoPublishOnFirstPublish().catch(err =>
        console.error('[PublicDataListener] Could not enable auto-publish:', err)
      )
    }
    FriendService.getInstance().emitter.addEventListener('friend-event', this.firstPublishListener)

    await this.startListening()
  }

  /**
   * Turn auto-publish on the first time the user publishes — unless they have
   * already answered the question themselves. An explicit `false` stays false.
   */
  private async enableAutoPublishOnFirstPublish(): Promise<void> {
    const db = await IndexedDBService.getInstance()
    const preference = await db.getData('autoPublishEnabled')

    if (preference !== null && preference !== undefined) return

    console.log('[PublicDataListener] First publish, enabling auto-publish')
    await this.enableAutoPublish()
  }

  /**
   * Start listening to ActivityService events
   * Call this once during app bootstrap (after checking if auto-publish is enabled)
   */
  async startListening(): Promise<void> {
    if (this.listening) return

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

    // Also publish when friends list changes (following list update)
    this.friendsChangedListener = () => {
      console.log('[PublicDataListener] Friends changed, scheduling publish')
      if (this.debouncedPublish) this.debouncedPublish()
    }
    window.addEventListener('openstride:friends-changed', this.friendsChangedListener)

    // Also publish on manual refresh (restores pre-refactoring behavior)
    this.refreshRequestedListener = () => {
      console.log('[PublicDataListener] Refresh requested, scheduling publish')
      if (this.debouncedPublish) this.debouncedPublish()
    }
    window.addEventListener('openstride:refresh-requested', this.refreshRequestedListener)

    this.listening = true
    console.log(
      '[PublicDataListener] Started listening to ActivityService, friends-changed, and refresh-requested events'
    )
  }

  /**
   * Stop listening to ActivityService events
   */
  async stopListening(): Promise<void> {
    if (this.activityServiceListener) {
      const activityService = await getActivityService()
      activityService.emitter.removeEventListener('activity-changed', this.activityServiceListener)
      this.activityServiceListener = null
    }
    if (this.friendsChangedListener) {
      window.removeEventListener('openstride:friends-changed', this.friendsChangedListener)
      this.friendsChangedListener = null
    }
    if (this.refreshRequestedListener) {
      window.removeEventListener('openstride:refresh-requested', this.refreshRequestedListener)
      this.refreshRequestedListener = null
    }
    this.debouncedPublish = null
    this.listening = false
    console.log('[PublicDataListener] Stopped listening')
  }

  /**
   * Publish public data now (called by debounced function or manually)
   * Delegates to FriendService.publishPublicData() for a single publish path
   * that includes activities, interactions, and the following list.
   */
  async publishNow(): Promise<{ success: boolean; error?: string }> {
    if (this.isPublishing) {
      console.log('[PublicDataListener] Already publishing, skipping')
      return { success: false, error: 'Already publishing' }
    }

    this.isPublishing = true
    this.emitter.dispatchEvent(new CustomEvent('publish-started'))

    try {
      const friendService = FriendService.getInstance()
      const result = await friendService.publishPublicData()

      if (result) {
        console.log('[PublicDataListener] Published successfully via FriendService')
        this.emitter.dispatchEvent(
          new CustomEvent('publish-completed', {
            detail: { manifestUrl: result }
          })
        )
        return { success: true }
      } else {
        throw new Error('FriendService.publishPublicData() returned null')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[PublicDataListener] Publish failed:', err)
      this.emitter.dispatchEvent(
        new CustomEvent('publish-failed', {
          detail: { error: message }
        })
      )
      return { success: false, error: message }
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
