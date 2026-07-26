// plugins/storage-providers/GDrive/client/GoogleDriveAuthService.ts
import { OAuthPkceAuthService } from '../../shared/OAuthPkceAuthService'

// OAuth Client type: Web application (exige client_secret même avec PKCE)
// Compromis serverless : secret exposé côté client mais protégé par redirect URIs
//
// Note : Desktop app OAuth clients ne fonctionnent pas depuis le navigateur.
// Pour sécurité maximale sans secret, il faudrait un backend proxy.
// Actuellement : secret dans .env (pas hardcodé, pas committé, rotatable).
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET

export class GoogleDriveAuthService extends OAuthPkceAuthService {
  // Memoize the promise, not the instance: two overlapping callers must not get
  // a service whose plugin context is still resolving.
  private static instancePromise: Promise<GoogleDriveAuthService> | null = null

  private constructor() {
    super({
      providerId: 'gdrive',
      label: 'GDrive',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/drive.file',
      // Google only returns a refresh token when offline access is requested
      // *and* the consent screen is forced.
      authorizationParams: { access_type: 'offline', prompt: 'consent' },
      hydrateStores: ['activities', 'activity_details', 'settings']
    })
  }

  public static async getInstance(): Promise<GoogleDriveAuthService> {
    if (!GoogleDriveAuthService.instancePromise) {
      GoogleDriveAuthService.instancePromise = (async () => {
        const service = new GoogleDriveAuthService()
        await service.initialize()
        return service
      })()
    }
    return GoogleDriveAuthService.instancePromise
  }
}
