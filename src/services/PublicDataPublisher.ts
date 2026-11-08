import { IndexedDBService } from './IndexedDBService'
import { PublicDataService } from './PublicDataService'
import { PublicFileService } from './PublicFileService'
import { ShareUrlService } from './ShareUrlService'
import { OWNER_SHARE_KEY, generateShareKey } from '@/utils/publicCrypto'
import { getInteractionSyncService } from './InteractionSyncService'
import { getPublicPhotoPublisher } from './PublicPhotoPublisher'
import type { FriendServiceEvent } from '@/types/friend'

/**
 * Handles publishing own public profile and activities.
 * Extracted from FriendService (SRP).
 */
export class PublicDataPublisher {
  private static instance: PublicDataPublisher
  public emitter = new EventTarget()

  private constructor() {
    /* singleton */
  }

  public static getInstance(): PublicDataPublisher {
    if (!PublicDataPublisher.instance) {
      PublicDataPublisher.instance = new PublicDataPublisher()
    }
    return PublicDataPublisher.instance
  }

  private emitEvent(event: FriendServiceEvent): void {
    this.emitter.dispatchEvent(
      new CustomEvent<FriendServiceEvent>('friend-event', { detail: event })
    )
  }

  /**
   * Publish user's public data to public file storage
   * Creates manifest.json + activities-YYYY.json files
   * Returns the manifest URL for sharing
   */
  public async publishPublicData(): Promise<string | null> {
    const uploadedFileIds: string[] = []

    try {
      const publicDataService = PublicDataService.getInstance()
      const publicFileService = PublicFileService.getInstance()
      const db = await IndexedDBService.getInstance()

      // A first publication is sealed from the start. A profile already
      // published without a key stays readable by the friends who hold its
      // link, until its owner changes the link (`rotatePublicLink`).
      if (!(await db.getData('myPublicUrl')) && !(await db.getData(OWNER_SHARE_KEY))) {
        await db.saveData(OWNER_SHARE_KEY, generateShareKey())
      }

      // The photos first, when shared: the year files list their links
      const sharing = await publicDataService.getSharingSettings()
      const photoLinks = sharing.photos
        ? await getPublicPhotoPublisher().publish(await publicDataService.listPublicActivityIds())
        : new Map()

      const { manifest, yearFiles, detailFiles } =
        await publicDataService.generateAllPublicData(photoLinks)

      const yearUrls = new Map<number, string>()
      const uploadErrors: string[] = []

      for (const [year, yearData] of yearFiles.entries()) {
        const filename = `activities-${year}.json`
        const url = await publicFileService.writePublicFile(filename, yearData)

        if (!url) {
          uploadErrors.push(`${year}`)
          console.error(`[PublicDataPublisher] Failed to upload ${filename}`)
        } else {
          yearUrls.set(year, url)
          const fileId = publicFileService.extractFileIdFromUrl(url)
          if (fileId) uploadedFileIds.push(fileId)
        }
      }

      if (uploadErrors.length > 0) {
        console.error(
          `[PublicDataPublisher] Failed to upload year files: ${uploadErrors.join(', ')}`
        )
        this.emitEvent({
          type: 'publish-error',
          messageKey: 'friendEvents.publishYearsFailed',
          messageParams: { years: uploadErrors.join(', ') },
          messageType: 'error'
        })
        await this.rollbackUploadedFiles(publicFileService, uploadedFileIds)
        return null
      }

      // What the reader chose to share beyond the summary, beside each year
      const detailUrls = new Map<number, string>()
      for (const [year, details] of detailFiles.entries()) {
        const url = await publicFileService.writePublicFile(
          `activity-details-${year}.json`,
          details
        )
        if (!url) {
          uploadErrors.push(`${year}`)
          continue
        }
        detailUrls.set(year, url)
        const fileId = publicFileService.extractFileIdFromUrl(url)
        if (fileId) uploadedFileIds.push(fileId)
      }
      if (uploadErrors.length > 0) {
        this.emitEvent({
          type: 'publish-error',
          messageKey: 'friendEvents.publishYearsFailed',
          messageParams: { years: uploadErrors.join(', ') },
          messageType: 'error'
        })
        await this.rollbackUploadedFiles(publicFileService, uploadedFileIds)
        return null
      }

      for (const yearEntry of manifest.availableYears) {
        const url = yearUrls.get(yearEntry.year)
        if (url) {
          yearEntry.fileUrl = url
        }
        const detailsUrl = detailUrls.get(yearEntry.year)
        if (detailsUrl) yearEntry.detailsUrl = detailsUrl
      }

      const interactionSyncService = getInteractionSyncService()
      const interactionResult = await interactionSyncService.publishInteractions()
      if (!interactionResult.success) {
        console.warn(
          '[PublicDataPublisher] Interactions not republished:',
          interactionResult.errors
        )
      }

      // Listed whether or not this round's upload worked: a friend reads a
      // missing year as interactions taken back, so a failed upload must leave
      // the files already online listed rather than make them vanish.
      const interactionYears = await interactionSyncService.getInteractionYearsForManifest()
      if (interactionYears.length > 0) {
        manifest.availableInteractionYears = interactionYears
      }

      const manifestUrl = await publicFileService.writePublicFile('manifest.json', manifest)

      if (!manifestUrl) {
        console.error('[PublicDataPublisher] Failed to upload manifest')
        this.emitEvent({
          type: 'publish-error',
          messageKey: 'friendEvents.publishManifestFailed',
          messageType: 'error'
        })
        await this.rollbackUploadedFiles(publicFileService, uploadedFileIds)
        return null
      }

      await db.saveData('myPublicUrl', manifestUrl)

      // Now that no file lists them any more: the photos withdrawn since
      try {
        const kept = new Set([...photoLinks.values()].flat().map(p => p.id))
        await getPublicPhotoPublisher().prune(kept)
      } catch (error) {
        console.warn('[PublicDataPublisher] Could not remove withdrawn photos:', error)
      }
      // With auto-publish off, this is the only way to tell a fresh profile
      // from one frozen three months ago.
      await db.saveData('myPublicPublishedAt', Date.now())
      const shareUrl = ShareUrlService.wrapManifestUrl(manifestUrl, await this.getShareKey())

      this.emitEvent({
        type: 'publish-completed',
        publishUrl: shareUrl,
        messageKey: 'friendEvents.publishSucceeded',
        messageType: 'success'
      })

      return shareUrl
    } catch (error) {
      console.error('[PublicDataPublisher] Error publishing public data:', error)
      this.emitEvent({
        type: 'publish-error',
        messageKey: 'friendEvents.publishFailed',
        messageType: 'error'
      })
      await this.rollbackUploadedFiles(PublicFileService.getInstance(), uploadedFileIds)
      return null
    }
  }

  private async rollbackUploadedFiles(
    publicFileService: PublicFileService,
    fileIds: string[]
  ): Promise<void> {
    if (fileIds.length === 0) return
    console.warn(`[PublicDataPublisher] Rolling back ${fileIds.length} uploaded files`)
    for (const fileId of fileIds) {
      try {
        await publicFileService.deleteFile(fileId)
      } catch (error) {
        console.error(
          `[PublicDataPublisher] Failed to delete file ${fileId} during rollback:`,
          error
        )
      }
    }
  }

  /**
   * Get current user's share URL (dynamically wrapped with current hostname)
   */
  public async getMyPublicUrl(): Promise<string | null> {
    const db = await IndexedDBService.getInstance()
    const storedUrl = (await db.getData('myPublicUrl')) as string | null

    if (!storedUrl) return null

    if (ShareUrlService.isShareUrl(storedUrl)) {
      const manifestUrl = ShareUrlService.unwrapManifestUrl(storedUrl)
      if (manifestUrl) {
        await db.saveData('myPublicUrl', manifestUrl)
        return ShareUrlService.wrapManifestUrl(manifestUrl, await this.getShareKey())
      }
      return null
    }

    return ShareUrlService.wrapManifestUrl(storedUrl, await this.getShareKey())
  }

  /** The key the reader's public files are sealed with, if they are. */
  private async getShareKey(): Promise<string | undefined> {
    const db = await IndexedDBService.getInstance()
    return (await db.getData<string>(OWNER_SHARE_KEY)) ?? undefined
  }

  /** Whether the reader's public files are sealed (see `publicCrypto`). */
  public async isSealed(): Promise<boolean> {
    return !!(await this.getShareKey())
  }

  /**
   * A new link, sealed with a new key, and the old one emptied.
   *
   * Every public file is deleted then written again, so they come back at new
   * addresses: whoever held the old link, or a copy of the old files' URLs,
   * opens nothing. Friends follow again from the new link. This is also how a
   * profile published before encryption becomes sealed.
   */
  public async rotatePublicLink(): Promise<string | null> {
    const db = await IndexedDBService.getInstance()
    const publicFileService = PublicFileService.getInstance()
    if (!(await publicFileService.clearPublicFiles())) {
      this.emitEvent({
        type: 'publish-error',
        messageKey: 'friendEvents.rotateFailed',
        messageType: 'error'
      })
      return null
    }
    await db.saveData(OWNER_SHARE_KEY, generateShareKey())
    await db.deleteData('myPublicUrl')
    // Their files went with the rest: published again, under the new key
    await getPublicPhotoPublisher().forget()
    return this.publishPublicData()
  }

  /**
   * Get the raw manifest URL (without share wrapper)
   */
  public async getMyManifestUrl(): Promise<string | null> {
    const db = await IndexedDBService.getInstance()
    const storedUrl = (await db.getData('myPublicUrl')) as string | null

    if (!storedUrl) return null

    if (ShareUrlService.isShareUrl(storedUrl)) {
      return ShareUrlService.unwrapManifestUrl(storedUrl)
    }

    return storedUrl
  }

  /**
   * Check if user has published public data
   */
  public async hasPublishedData(): Promise<boolean> {
    const url = await this.getMyPublicUrl()
    return url !== null && url !== undefined
  }

  /**
   * What the profile screen needs to state rather than imply: how many
   * activities a friend receives, and how stale the published copy is.
   *
   * `publishedAt` is null for a profile published before the timestamp
   * existed — unknown, which is not the same as never.
   */
  public async getPublicSummary(): Promise<{
    activityCount: number
    publishedAt: number | null
  }> {
    const db = await IndexedDBService.getInstance()
    return {
      activityCount: await PublicDataService.getInstance().countPublicActivities(),
      publishedAt: (await db.getData<number>('myPublicPublishedAt')) ?? null
    }
  }
}
