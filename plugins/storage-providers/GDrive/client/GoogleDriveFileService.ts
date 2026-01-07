// services/GoogleDriveFileService.ts

//TODO autoriser les fetch avec les ids de fichiers et dossiers stockés dans IndexedDB
// afin d'eviter les multiples fetch pour les fichiers et dossiers de la même session

import { GoogleDriveAuthService } from './GoogleDriveAuthService';

const DRIVE_API_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files";

export class GoogleDriveFileService {
    private static instance: GoogleDriveFileService;
    private authService: GoogleDriveAuthService | null = null;
    private folderId: string | null = null; // ID du dossier OpenStride
    private manifestFileId: string | null = null;

    private constructor() { }

    public static async getInstance(): Promise<GoogleDriveFileService> {
        if (!GoogleDriveFileService.instance) {
            GoogleDriveFileService.instance = new GoogleDriveFileService();
            await GoogleDriveFileService.instance.initialize();
        }
        return GoogleDriveFileService.instance;
    }

    private async initialize() {
        this.authService = await GoogleDriveAuthService.getInstance();
        this.folderId = await this.ensureFolderExists("OpenStride");
    }

    // ✅ 1. Vérifier ou créer le dossier OpenStride
    private async ensureFolderExists(folderName: string): Promise<string | null> {
        const accessToken = await this.authService?.getAccessToken();
        if (!accessToken) {
            console.error("Not authenticated with Google Drive.");
            return null;
        }

        // ✅ Vérifier si le dossier existe déjà
        const response = await fetch(`${DRIVE_API_ENDPOINT}?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, {
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
            console.error("Error searching for folder:", await response.text());
        }

        // ✅ Créer le dossier s'il n'existe pas
        const createResponse = await fetch(DRIVE_API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });

        if (createResponse.ok) {
            const folderData = await createResponse.json();
            return folderData.id;
        } else {
            console.error("Error creating folder:", await createResponse.text());
        }

        return null;
    }

    // ✅ 2. Vérifier ou créer le fichier de backup
    async ensureBackupFile(filename: string): Promise<string | null> {
        const accessToken = await this.authService?.getAccessToken();
        if (!accessToken) {
            console.error("Not authenticated with Google Drive.");
            return null;
        }

        // ✅ Vérifier si le fichier existe dans le dossier
        const fileId = await this.findBackupFile(filename, accessToken);
        if (fileId) {
            return fileId;
        }

        // ✅ Créer le fichier s'il n'existe pas
        const newFileId = await this.createBackupFile(filename, accessToken);
        console.log("Backup file created:", newFileId);
        return newFileId;
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
                this.folderId = await this.ensureFolderExists("OpenStride");
            } catch (e) {
                console.warn('[GDrive] Unable to lazily ensure folder', e);
            }
            if (!this.folderId) {
                // Auth might not be ready yet; return null quietly to let upstream retry later
                return null;
            }
        }

        // ✅ Vérifier uniquement les fichiers dans le dossier OpenStride
        const query = `name='${filename}' and '${this.folderId}' in parents and trashed=false`;
        const response = await fetch(`${DRIVE_API_ENDPOINT}?q=${encodeURIComponent(query)}&spaces=drive`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.files && data.files.length > 0) {
                console.log("Backup file found:", data.files[0].id, data.files[0]);
                return data.files[0].id;
            } else {
                console.log("No backup file found in the specified folder.");
            }
        } else {
            console.error("Error listing files:", await response.text());
        }

        return null;
    }

    private async createBackupFile(filename: string, accessToken: string): Promise<string | null> {
        if (!this.folderId) {
            console.error("Folder ID not set. Cannot create backup file.");
            return null;
        }

        const response = await fetch(`${DRIVE_API_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: filename,
                mimeType: 'application/json',
                parents: [this.folderId]
            })
        });

        if (response.ok) {
            const data = await response.json();
            return data.id;
        } else {
            console.error("Error creating file:", await response.text());
        }

        return null;
    }

    async writeBackupFileByFileId(fileId: string, content: any) {
        const accessToken = await this.authService?.getAccessToken();
        if (!accessToken) {
            console.error("Not authenticated with Google Drive.");
            return;
        }
        const response = await fetch(`${DRIVE_UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(content)
        });

        if (response.ok) {
            console.log("Backup file updated successfully.");
        } else {
            console.error("Error writing to backup file:", await response.text());
        }
    }

    // ✅ 3. Écrire ou mettre à jour le fichier de backup
    async writeBackupFile(filename: string, content: any) {
        const accessToken = await this.authService?.getAccessToken();
        if (!accessToken) {
            console.error("Not authenticated with Google Drive.");
            return;
        }

        const fileId = await this.ensureBackupFile(filename);
        if (!fileId) {
            console.error("Failed to ensure backup file.");
            return;
        }

        this.writeBackupFileByFileId(fileId, content).catch(error => {
            console.error("Error writing to backup file:", error);
        });
    }

    public async readBackupFileContent(fileId: string): Promise<any | null> {
        const accessToken = await this.authService?.getAccessToken();
        if (!accessToken) throw new Error("Not authenticated");

        const url = `${DRIVE_API_ENDPOINT}/${fileId}?alt=media`;
        const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!resp.ok) {
            console.warn("No existing backup to read, status", resp.status);
            return null;
        }
        return await resp.json();
    }

    // Manifest helpers
    public async ensureManifest(): Promise<string | null> {
        if (this.manifestFileId) return this.manifestFileId;
        const accessToken = await this.authService?.getAccessToken();
        if (!accessToken) return null;
        const id = await this.findBackupFile('stores_index.json', accessToken);
        if (id) { this.manifestFileId = id; return id; }
        const created = await this.createBackupFile('stores_index.json', accessToken);
        this.manifestFileId = created; return created;
    }

    public async readManifest(): Promise<any | null> {
        const id = await this.ensureManifest();
        if (!id) return null;
        try { return await this.readBackupFileContent(id); } catch { return null; }
    }

    public async writeManifest(manifest: any): Promise<void> {
        const id = await this.ensureManifest();
        if (!id) { console.warn('[GDrive] cannot write manifest'); return; }
        await this.writeBackupFileByFileId(id, manifest);
    }
}
