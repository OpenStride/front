import { IndexedDBService } from './IndexedDBService'
import { PublicDataService } from './PublicDataService'
import { PublicFileService } from './PublicFileService'
import { ShareUrlService } from './ShareUrlService'
import { getInteractionSyncService } from './InteractionSyncService'
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

      const { manifest, yearFiles } = await publicDataService.generateAllPublicData()

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
          message: `Échec de publication pour les années: ${uploadErrors.join(', ')}`,
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
      }

      const interactionSyncService = getInteractionSyncService()
      const interactionResult = await interactionSyncService.publishInteractions()

      if (interactionResult.success && interactionResult.interactionsSynced > 0) {
        const interactionYears = await interactionSyncService.getInteractionYearsForManifest()
        if (interactionYears.length > 0) {
          manifest.availableInteractionYears = interactionYears
          console.log(
            `[PublicDataPublisher] Added ${interactionYears.length} interaction years to manifest`
          )
        }
      }

      const manifestUrl = await publicFileService.writePublicFile('manifest.json', manifest)

      if (!manifestUrl) {
        console.error('[PublicDataPublisher] Failed to upload manifest')
        this.emitEvent({
          type: 'publish-error',
          message: 'Échec de publication du manifest',
          messageType: 'error'
        })
        await this.rollbackUploadedFiles(publicFileService, uploadedFileIds)
        return null
      }

      await db.saveData('myPublicUrl', manifestUrl)
      const shareUrl = ShareUrlService.wrapManifestUrl(manifestUrl)

      this.emitEvent({
        type: 'publish-completed',
        publishUrl: shareUrl,
        message: 'Données publiques publiées avec succès!',
        messageType: 'success'
      })

      return shareUrl
    } catch (error) {
      console.error('[PublicDataPublisher] Error publishing public data:', error)
      this.emitEvent({
        type: 'publish-error',
        message: 'Erreur lors de la publication',
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
        return ShareUrlService.wrapManifestUrl(manifestUrl)
      }
      return null
    }

    return ShareUrlService.wrapManifestUrl(storedUrl)
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
}
