// services/GoogleDriveFileService.ts

//TODO autoriser les fetch avec les ids de fichiers et dossiers stockés dans IndexedDB
// afin d'eviter les multiples fetch pour les fichiers et dossiers de la même session

import { GoogleDriveAuthService } from './GoogleDriveAuthService'
import { logger } from '@/utils/logger'

const DRIVE_API_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files'

export class GoogleDriveFileService {
  private static instance: GoogleDriveFileService
  private authService: GoogleDriveAuthService | null = null
  private folderId: string | null = null // ID du dossier OpenStride
  // Cache filename -> fileId to avoid a Drive search on every read/write.
  // Files are only ever created/trashed by this app, so staleness is rare;
  // a stale id surfaces as a 404 which is handled gracefully upstream.
  private backupFileIds = new Map<string, string>()

  private constructor() {
    /* singleton */
  }

  public static async getInstance(): Promise<GoogleDriveFileService> {
    if (!GoogleDriveFileService.instance) {
      GoogleDriveFileService.instance = new GoogleDriveFileService()
      await GoogleDriveFileService.instance.initialize()
    }
    return GoogleDriveFileService.instance
  }

  private async initialize() {
    this.authService = await GoogleDriveAuthService.getInstance()
    this.folderId = await this.ensureFolderExists('OpenStride')
  }

  // ✅ 1. Vérifier ou créer le dossier OpenStride
  private async ensureFolderExists(folderName: string): Promise<string | null> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      console.error('Not authenticated with Google Drive.')
      return null
    }

    // ✅ Vérifier si le dossier existe déjà
    const response = await fetch(
      `${DRIVE_API_ENDPOINT}?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.files && data.files.length > 0) {
        return data.files[0].id
      }
    } else {
      console.error('Error searching for folder:', await response.text())
    }

    // ✅ Créer le dossier s'il n'existe pas
    const createResponse = await fetch(DRIVE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    })

    if (createResponse.ok) {
      const folderData = await createResponse.json()
      return folderData.id
    } else {
      console.error('Error creating folder:', await createResponse.text())
    }

    return null
  }

  // ✅ 2. Vérifier ou créer le fichier de backup
  async ensureBackupFile(filename: string): Promise<string | null> {
    // ✅ Réutiliser l'ID mis en cache pour éviter une recherche Drive répétée
    const cached = this.backupFileIds.get(filename)
    if (cached) return cached

    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      console.error('Not authenticated with Google Drive.')
      return null
    }

    // ✅ Vérifier si le fichier existe dans le dossier
    const fileId = await this.findBackupFile(filename, accessToken)
    if (fileId) {
      this.backupFileIds.set(filename, fileId)
      return fileId
    }

    // ✅ Créer le fichier s'il n'existe pas
    const newFileId = await this.createBackupFile(filename, accessToken)
    logger.debug('Backup file created:', newFileId)
    if (newFileId) this.backupFileIds.set(filename, newFileId)
    return newFileId
  }

  /*     private async findBackupFileOld(filename: string, accessToken: string): Promise<string | null> {
            if (!this.folderId) {
                console.error("Folder ID not set. Cannot find backup file.");
                return null;
            }
    
            const response = await fetch(`${DRIVE_API_ENDPOINT}?q=name='${filename}' and '${this.folderId}' in parents and trashed=false`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
    
            if (response.ok) {
                const data = await response.json();
                if (data.files && data.files.length > 0) {
                    return data.files[0].id;
                }
            } else {
                console.error("Error listing files:", await response.text());
            }
    
            return null;
        } */

  private async findBackupFile(filename: string, accessToken: string): Promise<string | null> {
    // Lazily ensure folder exists if not yet initialized (race-safe)
    if (!this.folderId) {
      try {
        this.folderId = await this.ensureFolderExists('OpenStride')
      } catch (e) {
        console.warn('[GDrive] Unable to lazily ensure folder', e)
      }
      if (!this.folderId) {
        // Auth might not be ready yet; return null quietly to let upstream retry later
        return null
      }
    }

    // ✅ Vérifier uniquement les fichiers dans le dossier OpenStride
    const query = `name='${filename}' and '${this.folderId}' in parents and trashed=false`
    const response = await fetch(
      `${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}&spaces=drive`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.files && data.files.length > 0) {
        logger.debug('Backup file found:', data.files[0].id, data.files[0])
        return data.files[0].id
      } else {
        logger.debug('No backup file found in the specified folder.')
      }
    } else {
      console.error('Error listing files:', await response.text())
    }

    return null
  }

  private async createBackupFile(filename: string, accessToken: string): Promise<string | null> {
    if (!this.folderId) {
      console.error('Folder ID not set. Cannot create backup file.')
      return null
    }

    const response = await fetch(`${DRIVE_API_ENDPOINT}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: filename,
        mimeType: 'application/json',
        parents: [this.folderId]
      })
    })

    if (response.ok) {
      const data = await response.json()
      return data.id
    } else {
      console.error('Error creating file:', await response.text())
    }

    return null
  }

  async writeBackupFileByFileId(fileId: string, content: unknown) {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      console.error('Not authenticated with Google Drive.')
      return
    }
    const response = await fetch(`${DRIVE_UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    })

    if (response.ok) {
      logger.debug('Backup file updated successfully.')
    } else {
      console.error('Error writing to backup file:', await response.text())
    }
  }

  // ✅ 3. Écrire ou mettre à jour le fichier de backup
  async writeBackupFile(filename: string, content: unknown) {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      console.error('Not authenticated with Google Drive.')
      return
    }

    const fileId = await this.ensureBackupFile(filename)
    if (!fileId) {
      console.error('Failed to ensure backup file.')
      return
    }

    this.writeBackupFileByFileId(fileId, content).catch(error => {
      console.error('Error writing to backup file:', error)
    })
  }

  public async readBackupFileContent(fileId: string): Promise<unknown> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) throw new Error('Not authenticated')

    const url = `${DRIVE_API_ENDPOINT}/${fileId}?alt=media`
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!resp.ok) {
      console.warn('No existing backup to read, status', resp.status)
      return null
    }
    return await resp.json()
  }

  /**
   * Cheap change-detection: fetch only the file metadata (md5Checksum /
   * modifiedTime) WITHOUT downloading the content. Returns null when the file
   * does not exist yet (does NOT create it) or when not authenticated.
   */
  public async getBackupFileMeta(
    filename: string
  ): Promise<{ md5?: string; modifiedTime?: string } | null> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return null

    // Resolve id from cache or a search, but never create the file for a read-only check
    let fileId = this.backupFileIds.get(filename) || null
    if (!fileId) {
      fileId = await this.findBackupFile(filename, accessToken)
      if (fileId) this.backupFileIds.set(filename, fileId)
    }
    if (!fileId) return null

    const resp = await fetch(`${DRIVE_API_ENDPOINT}/${fileId}?fields=md5Checksum,modifiedTime`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!resp.ok) {
      console.warn('[GDrive] Failed to read file metadata, status', resp.status)
      return null
    }
    const data = await resp.json()
    return { md5: data.md5Checksum, modifiedTime: data.modifiedTime }
  }

  // ========== PRIVATE FILES (photos) ==========

  private photoFolderId: string | null = null

  /** OpenStride/photos, private: the images of the reader's outings. */
  private async ensurePhotoFolder(accessToken: string): Promise<string | null> {
    if (this.photoFolderId) return this.photoFolderId
    if (!this.folderId) this.folderId = await this.ensureFolderExists('OpenStride')
    if (!this.folderId) return null

    const query = `name='photos' and '${this.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const search = await fetch(`${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (search.ok) {
      const data = await search.json()
      if (data.files?.length) {
        this.photoFolderId = data.files[0].id as string
        return this.photoFolderId
      }
    }

    const create = await fetch(DRIVE_API_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'photos',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [this.folderId]
      })
    })
    if (!create.ok) {
      console.error('[GDrive] Error creating photos folder:', await create.text())
      return null
    }
    this.photoFolderId = (await create.json()).id as string
    return this.photoFolderId
  }

  /**
   * Upload a binary file to OpenStride/photos in one request (metadata and
   * content as a multipart body). Never public: only the reader's own devices
   * read it back, with their token.
   */
  public async writeFile(name: string, content: Blob): Promise<string | null> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return null
    const folderId = await this.ensurePhotoFolder(accessToken)
    if (!folderId) return null

    const boundary = `openstride-${Date.now().toString(36)}`
    const metadata = JSON.stringify({ name, parents: [folderId] })
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${content.type || 'application/octet-stream'}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`
    ])

    const response = await fetch(`${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    })
    if (!response.ok) {
      console.error('[GDrive] Failed to upload file:', await response.text())
      return null
    }
    return ((await response.json()).id as string) ?? null
  }

  /** Download a file written by `writeFile`; null when it is gone. */
  public async readFile(fileId: string): Promise<Blob | null> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return null
    const response = await fetch(`${DRIVE_API_ENDPOINT}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!response.ok) {
      console.warn('[GDrive] Failed to download file, status', response.status)
      return null
    }
    return await response.blob()
  }

  // ========== PUBLIC FILE SHARING METHODS ==========

  private publicFolderId: string | null = null

  /**
   * Ensure OpenStride/public folder exists (for public sharing)
   */
  private async ensurePublicFolder(): Promise<string | null> {
    if (this.publicFolderId) return this.publicFolderId

    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return null

    // Ensure parent OpenStride folder exists first
    if (!this.folderId) {
      this.folderId = await this.ensureFolderExists('OpenStride')
    }
    if (!this.folderId) return null

    // Check if public subfolder exists
    const query = `name='public' and '${this.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const response = await fetch(`${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.files && data.files.length > 0) {
        this.publicFolderId = data.files[0].id
        return this.publicFolderId
      }
    }

    // Create public folder
    const createResponse = await fetch(DRIVE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'public',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [this.folderId]
      })
    })

    if (createResponse.ok) {
      const folderData = await createResponse.json()
      this.publicFolderId = folderData.id
      return this.publicFolderId
    }

    console.error('Error creating public folder:', await createResponse.text())
    return null
  }

  /**
   * Set file permissions to public (anyone with link can view)
   */
  private async makeFilePublic(fileId: string): Promise<boolean> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return false

    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
          })
        }
      )

      if (!response.ok) {
        console.error('[GDrive] Failed to make file public:', await response.text())
        return false
      }

      return true
    } catch (error) {
      console.error('[GDrive] Error making file public:', error)
      return false
    }
  }

  /**
   * Write or update a public file in OpenStride/public/ folder
   * Returns the public download URL
   */
  public async writePublicFile(filename: string, content: unknown): Promise<string | null> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      console.error('[GDrive] Not authenticated')
      return null
    }

    // Ensure public folder exists
    const publicFolderId = await this.ensurePublicFolder()
    if (!publicFolderId) {
      console.error('[GDrive] Failed to ensure public folder')
      return null
    }

    // Check if file exists
    const query = `name='${filename}' and '${publicFolderId}' in parents and trashed=false`
    const searchResponse = await fetch(`${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    let fileId: string | null = null

    if (searchResponse.ok) {
      const data = await searchResponse.json()
      if (data.files && data.files.length > 0) {
        fileId = data.files[0].id
      }
    }

    // Create or update file
    if (fileId) {
      // Update existing file
      const updateResponse = await fetch(`${DRIVE_UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      })

      if (!updateResponse.ok) {
        console.error('[GDrive] Failed to update public file:', await updateResponse.text())
        return null
      }
    } else {
      // Create new file
      const createResponse = await fetch(DRIVE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: filename,
          mimeType: 'application/json',
          parents: [publicFolderId]
        })
      })

      if (!createResponse.ok) {
        console.error('[GDrive] Failed to create public file:', await createResponse.text())
        return null
      }

      const fileData = await createResponse.json()
      fileId = fileData.id

      // Write initial content
      const writeResponse = await fetch(`${DRIVE_UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      })

      if (!writeResponse.ok) {
        console.error('[GDrive] Failed to write content to new file:', await writeResponse.text())
        return null
      }
    }

    // Make file publicly readable
    const madePublic = await this.makeFilePublic(fileId!)
    if (!madePublic) {
      console.warn('[GDrive] File created but could not be made public')
    }

    // Return public download URL
    return `https://drive.google.com/uc?id=${fileId}&export=download`
  }

  /**
   * Get public download URL for a file in public folder
   */
  public async getPublicFileUrl(filename: string): Promise<string | null> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return null

    const publicFolderId = await this.ensurePublicFolder()
    if (!publicFolderId) return null

    const query = `name='${filename}' and '${publicFolderId}' in parents and trashed=false`
    const response = await fetch(`${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      if (data.files && data.files.length > 0) {
        const fileId = data.files[0].id
        return `https://drive.google.com/uc?id=${fileId}&export=download`
      }
    }

    return null
  }

  /**
   * Delete every file of the public folder: changing one's share link must
   * leave nothing behind at the old addresses.
   */
  public async clearPublicFiles(): Promise<boolean> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) return false
    const publicFolderId = await this.ensurePublicFolder()
    if (!publicFolderId) return false

    const query = `'${publicFolderId}' in parents and trashed=false`
    const response = await fetch(
      `${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1000`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!response.ok) return false
    const data = (await response.json()) as { files?: { id: string }[] }
    let ok = true
    for (const file of data.files ?? []) {
      if (!(await this.deleteFile(file.id))) ok = false
    }
    return ok
  }

  /**
   * Delete a file by its ID (used for cleanup on failed uploads)
   */
  public async deleteFile(fileId: string): Promise<boolean> {
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      console.error('[GDrive] Not authenticated')
      return false
    }

    try {
      const response = await fetch(`${DRIVE_API_ENDPOINT}/${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })

      // Already gone is what was asked for: a photo deleted from two devices
      // must not leave either retrying forever.
      if (!response.ok && response.status !== 404) {
        console.error('[GDrive] Failed to delete file:', await response.text())
        return false
      }

      // Drop any cached filename -> id mapping pointing at the deleted file
      for (const [name, id] of this.backupFileIds) {
        if (id === fileId) this.backupFileIds.delete(name)
      }

      return true
    } catch (error) {
      console.error('[GDrive] Error deleting file:', error)
      return false
    }
  }
}
