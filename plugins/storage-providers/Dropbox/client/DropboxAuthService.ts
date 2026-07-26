// plugins/storage-providers/Dropbox/client/DropboxAuthService.ts
import { OAuthPkceAuthService } from '../../shared/OAuthPkceAuthService'

// Dropbox supports PKCE for public clients, so NO client secret ships in the
// bundle — unlike the Google "Web application" client, which still demands one.
// The app must be registered with the "App folder" access type: every path below
// is then scoped to Apps/<app-name>/ and the plugin can never see the rest of
// the user's Dropbox.
const CLIENT_ID = import.meta.env.VITE_DROPBOX_CLIENT_ID

// files.content.*: read/write our own backup files.
// sharing.*: create and look up the public links used by profile sharing.
const SCOPE = 'files.content.write files.content.read sharing.write sharing.read'

export class DropboxAuthService extends OAuthPkceAuthService {
  // Memoize the promise, not the instance: two overlapping callers must not get
  // a service whose plugin context is still resolving.
  private static instancePromise: Promise<DropboxAuthService> | null = null

  private constructor() {
    super({
      providerId: 'dropbox',
      label: 'Dropbox',
      clientId: CLIENT_ID,
      authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
      tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
      scope: SCOPE,
      // Dropbox only issues a refresh token when offline access is requested;
      // without it the connection would die after ~4 hours.
      authorizationParams: { token_access_type: 'offline' },
      hydrateStores: ['activities', 'activity_details', 'settings']
    })
  }

  public static async getInstance(): Promise<DropboxAuthService> {
    if (!DropboxAuthService.instancePromise) {
      DropboxAuthService.instancePromise = (async () => {
        const service = new DropboxAuthService()
        await service.initialize()
        return service
      })()
    }
    return DropboxAuthService.instancePromise
  }
}
