// plugins/storage-providers/GDrive/client/GoogleDriveAuthService.ts
import { getPluginContext } from '@/services/PluginContextFactory'
import type { IPluginStorageService } from '@/types/plugin-context'
import type { INativeShell } from '@/services/NativeShellService'
import { generateCodeChallenge, generateRandomString } from './pkceUtils'

// OAuth Client type: Web application (exige client_secret même avec PKCE)
// Compromis serverless : secret exposé côté client mais protégé par redirect URIs
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET

// Note : Desktop app OAuth clients ne fonctionnent pas depuis le navigateur
// Pour sécurité maximale sans secret, il faudrait un backend proxy
// Actuellement : secret dans .env (pas hardcodé, pas committé, rotatable)

/**
 * The native app talks to Google as a *different* OAuth client.
 *
 * It has to. A Web client only accepts http(s) redirect URIs, and the native
 * shell has no origin worth redirecting to — it is served from
 * `https://localhost`, which no console will ever list. A native client
 * redirects to a custom scheme instead, and carries no secret: there is nowhere
 * to hide one in an APK, which is why Google does not issue one for this
 * client type. PKCE is what stands in for it, and this service already does
 * PKCE for the web.
 */
const NATIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_NATIVE_CLIENT_ID

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** Raised when the native build was shipped without its own OAuth client. */
export class MissingNativeClientError extends Error {}

export class GoogleDriveAuthService {
  private static instance: GoogleDriveAuthService
  private dbService: IPluginStorageService | null = null
  private shell: INativeShell | null = null
  // Dedup concurrent silent refreshes so a burst of Drive calls with an expired
  // token results in ONE token POST, not one per call.
  private refreshInFlight: Promise<string | null> | null = null
  // Hydration from remote must happen at most once per session, not on every
  // token refresh (getAccessToken runs on every Drive fetch).
  private hydrationDone = false

  private constructor() {
    /* singleton */
  }

  public static async getInstance(): Promise<GoogleDriveAuthService> {
    if (!GoogleDriveAuthService.instance) {
      GoogleDriveAuthService.instance = new GoogleDriveAuthService()
      await GoogleDriveAuthService.instance.initialize()
    }
    return GoogleDriveAuthService.instance
  }

  private async initialize() {
    const ctx = await getPluginContext()
    this.dbService = ctx.storage
    this.shell = ctx.shell
  }

  /** True once the app runs in the native shell, where the web flow cannot work. */
  private get isNative(): boolean {
    return this.shell?.isNative ?? false
  }

  /** The client this platform authenticates as. */
  private get clientId(): string {
    if (!this.isNative) return CLIENT_ID
    if (!NATIVE_CLIENT_ID) {
      throw new MissingNativeClientError('VITE_GOOGLE_NATIVE_CLIENT_ID is not set')
    }
    return NATIVE_CLIENT_ID
  }

  /**
   * Where Google sends the user back.
   *
   * On the web, the page that started the flow. On native, a custom scheme the
   * OS routes back into the app — the WebView's own `location.origin` is
   * `https://localhost`, which is not a redirect target anyone has registered.
   */
  private get redirectUri(): string {
    const native = this.shell?.oauthRedirectUri(this.clientId)
    return native ?? `${window.location.origin}${window.location.pathname}`
  }

  /**
   * A native client has no secret — Google does not issue one, because an APK
   * cannot keep it. PKCE carries the proof instead.
   */
  private credentials(): Record<string, string> {
    return this.isNative
      ? { client_id: this.clientId }
      : { client_id: CLIENT_ID, client_secret: CLIENT_SECRET }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.dbService) return null

    const accessToken = await this.dbService.getData<string>('gdrive_access_token')
    const refreshToken = await this.dbService.getData<string>('gdrive_refresh_token')
    const accessTokenExpireTimestamp = await this.dbService.getData<number>(
      'gdrive_access_token_expire_timestamp'
    )
    const now = Date.now()

    if (
      accessToken &&
      refreshToken &&
      accessTokenExpireTimestamp &&
      now < accessTokenExpireTimestamp
    ) {
      return accessToken
    } else if (refreshToken) {
      return this.refreshAccessToken(refreshToken)
    } else {
      console.error('No valid access token or refresh token found.')
      return null
    }
  }

  /**
   * Exchange the refresh token for a fresh access token.
   * Concurrent callers share a single in-flight request.
   */
  private async refreshAccessToken(refreshToken: string): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight

    this.refreshInFlight = (async () => {
      try {
        const tokenResponse = await fetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            ...this.credentials(),
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          })
        })

        if (!tokenResponse.ok) {
          console.error('Error refreshing access token:', await tokenResponse.text())
          return null
        }

        const tokenData = await tokenResponse.json()
        await this.dbService?.saveData('gdrive_access_token', tokenData.access_token)
        await this.dbService?.saveData(
          'gdrive_access_token_expire_timestamp',
          tokenData.expires_in * 1000 + Date.now()
        )
        // Hydrate a returning user's local DB once per session (not per refresh).
        this.hydrateOnce()
        return tokenData.access_token
      } finally {
        this.refreshInFlight = null
      }
    })()

    return this.refreshInFlight
  }

  /**
   * One-way import from remote to hydrate local stores. Runs at most once per
   * session — auth must not drive a full sync on every token refresh.
   */
  private hydrateOnce() {
    if (this.hydrationDone) return
    this.hydrationDone = true
    this.dbService
      ?.importFromRemote(['activities', 'activity_details', 'settings'])
      .catch((err: unknown) => console.warn('[GDrive] hydration after refresh failed', err))
  }

  async getAccessTokenFromCode(code: string): Promise<string | null> {
    const state = localStorage.getItem('pkce_state')
    const code_verifier = localStorage.getItem('pkce_code_verifier')

    if (!state || !code_verifier) {
      console.error('State or code_verifier not found in local storage.')
      return null
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        ...this.credentials(),
        code: code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: code_verifier
      })
    })

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json()
      this.dbService?.saveData('gdrive_access_token', tokenData.access_token)
      this.dbService?.saveData(
        'gdrive_access_token_expire_timestamp',
        tokenData.expires_in * 1000 + Date.now()
      )
      this.dbService?.saveData('gdrive_refresh_token', tokenData.refresh_token)

      window.history.replaceState({}, document.title, window.location.pathname)

      // Hydrate local stores now that we have first access token (once per session)
      this.hydrateOnce()

      return tokenData.access_token
    } else {
      console.error(
        'Error exchanging authorization code for access token:',
        await tokenResponse.text()
      )
    }

    return null
  }

  async getOauthSignInUri(): Promise<string | null> {
    const state = generateRandomString()
    localStorage.setItem('pkce_state', state)

    // Create and store a new PKCE code_verifier (the plaintext random secret)
    const code_verifier = generateRandomString()
    localStorage.setItem('pkce_code_verifier', code_verifier)

    // Hash and base64-urlencode the secret to use as the challenge
    const code_challenge = await generateCodeChallenge(code_verifier)
    const url =
      AUTHORIZATION_ENDPOINT +
      '?response_type=code' +
      '&client_id=' +
      encodeURIComponent(this.clientId) +
      '&state=' +
      encodeURIComponent(state) +
      '&access_type=offline' +
      '&prompt=consent' +
      '&scope=' +
      encodeURIComponent(SCOPE) +
      '&redirect_uri=' +
      encodeURIComponent(this.redirectUri) +
      '&code_challenge=' +
      encodeURIComponent(code_challenge) +
      '&code_challenge_method=S256'
    // Redirect to the authorization server
    return url
  }

  /**
   * Sign in the way this platform can.
   *
   * On the web the page navigates away and the answer arrives as a `?code=` on
   * the way back, so this resolves to null and the caller redirects. On native
   * there is no navigating away — the authorization happens in a system browser
   * and the code comes back through a deep link, so the whole exchange finishes
   * here and this resolves to an access token.
   */
  async signIn(): Promise<{ handled: boolean; url?: string }> {
    const url = await this.getOauthSignInUri()
    if (!url) return { handled: false }
    if (!this.isNative || !this.shell) return { handled: false, url }

    const scheme = this.shell.oauthRedirectUri(this.clientId)
    if (!scheme) return { handled: false, url }

    const callback = await this.shell.authorize(url, scheme)
    const params = new URL(callback).searchParams

    // Any app on the device can fire our custom scheme, so the deep link is the
    // one step of this flow that an outsider can reach. `state` is what says the
    // answer belongs to the request we made.
    if (params.get('state') !== localStorage.getItem('pkce_state')) {
      throw new Error('state_mismatch')
    }

    const code = params.get('code')
    if (!code) throw new Error(params.get('error') ?? 'no_code')

    await this.getAccessTokenFromCode(code)
    return { handled: true }
  }

  async disconnect() {
    if (!this.dbService) return
    // Allow a fresh hydration on the next reconnect
    this.hydrationDone = false
    this.refreshInFlight = null
    await this.dbService.deleteData('gdrive_access_token')
    await this.dbService.deleteData('gdrive_refresh_token')
    await this.dbService.deleteData('gdrive_access_token_expire_timestamp')
  }
}
