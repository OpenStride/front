/**
 * Browser-side OAuth 2.0 + PKCE authorization-code flow, shared by the storage
 * provider plugins.
 *
 * OpenStride ships as a static PWA with no backend, so the whole flow runs in
 * the page: the plugin redirects to the provider, the provider redirects back to
 * the plugin's own setup route (`/storage-provider/<id>`), and the code is
 * exchanged from there. Because each provider owns a distinct route, two
 * providers can be connected without their callbacks colliding.
 *
 * Tokens live in IndexedDB through `PluginContext.storage` (never localStorage),
 * under keys namespaced by the plugin id. Only the short-lived PKCE verifier and
 * state sit in localStorage, since they must survive the full-page redirect.
 */
import { getPluginContext } from '@/services/PluginContextFactory'
import type { IPluginStorageService } from '@/types/plugin-context'
import { generateCodeChallenge, generateRandomString } from './pkce'

export interface OAuthPkceConfig {
  /** Plugin id. Namespaces every persisted key (`<id>_access_token`, ...). */
  providerId: string
  /** Human-readable name, used in log lines only. */
  label: string
  clientId: string
  /**
   * Only for providers whose OAuth client type still demands a secret on the
   * token endpoint (Google's "Web application" type). Providers with genuine
   * public-client PKCE support leave this undefined — nothing secret ships.
   */
  clientSecret?: string
  authorizationEndpoint: string
  tokenEndpoint: string
  scope?: string
  /**
   * Extra authorization-URL parameters. Used to request a refresh token, which
   * every provider spells differently (`access_type=offline` for Google,
   * `token_access_type=offline` for Dropbox).
   */
  authorizationParams?: Record<string, string>
  /** Stores hydrated one-way from remote, at most once per session. */
  hydrateStores?: string[]
}

export class OAuthPkceAuthService {
  protected readonly config: OAuthPkceConfig
  private dbService: IPluginStorageService | null = null

  // Dedup concurrent silent refreshes so a burst of API calls with an expired
  // token results in ONE token POST, not one per call.
  private refreshInFlight: Promise<string | null> | null = null

  // Hydration must happen at most once per session, not on every token refresh
  // (getAccessToken runs on every remote call).
  private hydrationDone = false

  constructor(config: OAuthPkceConfig) {
    this.config = config
  }

  /** Resolves the plugin context. Call once before any other method. */
  protected async initialize(): Promise<void> {
    const ctx = await getPluginContext()
    this.dbService = ctx.storage
  }

  /** False when the build has no client id for this provider (env not set). */
  public get isConfigured(): boolean {
    return Boolean(this.config.clientId)
  }

  private get accessTokenKey(): string {
    return `${this.config.providerId}_access_token`
  }

  private get refreshTokenKey(): string {
    return `${this.config.providerId}_refresh_token`
  }

  private get expiryKey(): string {
    return `${this.config.providerId}_access_token_expire_timestamp`
  }

  private get stateKey(): string {
    return `pkce_state_${this.config.providerId}`
  }

  private get verifierKey(): string {
    return `pkce_code_verifier_${this.config.providerId}`
  }

  private get logPrefix(): string {
    return `[${this.config.label}]`
  }

  /** Redirect target — the setup route the user is currently on. */
  protected get redirectUri(): string {
    return `${window.location.origin}${window.location.pathname}`
  }

  /**
   * A valid access token, refreshing silently when the current one expired.
   * Returns null when the user is not connected.
   */
  public async getAccessToken(): Promise<string | null> {
    if (!this.dbService) return null

    const accessToken = await this.dbService.getData<string>(this.accessTokenKey)
    const refreshToken = await this.dbService.getData<string>(this.refreshTokenKey)
    const expireTimestamp = await this.dbService.getData<number>(this.expiryKey)

    if (accessToken && refreshToken && expireTimestamp && Date.now() < expireTimestamp) {
      return accessToken
    }

    if (refreshToken) {
      return this.refreshAccessToken(refreshToken)
    }

    // An access token with no refresh token still works until it expires — that
    // is the shape providers return when offline access was never granted.
    if (accessToken && expireTimestamp && Date.now() < expireTimestamp) {
      return accessToken
    }

    return null
  }

  /**
   * Exchange the refresh token for a fresh access token.
   * Concurrent callers share a single in-flight request.
   */
  private async refreshAccessToken(refreshToken: string): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight

    this.refreshInFlight = (async () => {
      try {
        const body: Record<string, string> = {
          client_id: this.config.clientId,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }
        if (this.config.clientSecret) body.client_secret = this.config.clientSecret

        const tokenResponse = await fetch(this.config.tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body)
        })

        if (!tokenResponse.ok) {
          console.error(
            `${this.logPrefix} Error refreshing access token:`,
            await tokenResponse.text()
          )
          return null
        }

        const tokenData = await tokenResponse.json()
        await this.persistTokens(tokenData)
        // Hydrate a returning user's local DB once per session (not per refresh).
        this.hydrateOnce()
        return tokenData.access_token as string
      } catch (err) {
        console.error(`${this.logPrefix} Error refreshing access token:`, err)
        return null
      } finally {
        this.refreshInFlight = null
      }
    })()

    return this.refreshInFlight
  }

  /**
   * Persist a token response. The refresh token is only overwritten when the
   * provider actually returned one — refresh responses usually omit it, and
   * blanking it would log the user out on the next expiry.
   */
  private async persistTokens(tokenData: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }): Promise<void> {
    if (!this.dbService || !tokenData.access_token) return

    await this.dbService.saveData(this.accessTokenKey, tokenData.access_token)

    if (typeof tokenData.expires_in === 'number') {
      await this.dbService.saveData(this.expiryKey, tokenData.expires_in * 1000 + Date.now())
    }

    if (tokenData.refresh_token) {
      await this.dbService.saveData(this.refreshTokenKey, tokenData.refresh_token)
    }
  }

  /**
   * One-way import from remote to hydrate local stores. Runs at most once per
   * session — auth must not drive a full sync on every token refresh.
   */
  private hydrateOnce(): void {
    const stores = this.config.hydrateStores
    if (!stores?.length || this.hydrationDone) return
    this.hydrationDone = true
    this.dbService
      ?.importFromRemote(stores)
      .catch((err: unknown) =>
        console.warn(`${this.logPrefix} hydration after refresh failed`, err)
      )
  }

  /**
   * Authorization URL to redirect the user to. Stores the PKCE verifier and the
   * anti-CSRF state for the return trip.
   */
  public async getOauthSignInUri(): Promise<string | null> {
    if (!this.isConfigured) {
      console.error(`${this.logPrefix} Missing OAuth client id — check the build environment.`)
      return null
    }

    const state = generateRandomString()
    const codeVerifier = generateRandomString()
    localStorage.setItem(this.stateKey, state)
    localStorage.setItem(this.verifierKey, codeVerifier)

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      state,
      redirect_uri: this.redirectUri,
      code_challenge: await generateCodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      ...(this.config.scope ? { scope: this.config.scope } : {}),
      ...(this.config.authorizationParams ?? {})
    })

    return `${this.config.authorizationEndpoint}?${params.toString()}`
  }

  /**
   * Consume an `?code=` present in the current URL, if it belongs to this
   * provider. Returns null when there is no code to consume, so the setup
   * component can call it unconditionally on mount.
   */
  public async consumeRedirectCode(): Promise<string | null> {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    if (!code) return null

    const returnedState = urlParams.get('state')
    const expectedState = localStorage.getItem(this.stateKey)

    // The state must match the one we stored: it proves the redirect answers
    // *our* authorization request and not a forged one. Providers that drop the
    // parameter entirely are tolerated, a mismatch is not.
    if (returnedState && expectedState && returnedState !== expectedState) {
      console.error(`${this.logPrefix} OAuth state mismatch — ignoring the callback.`)
      return null
    }

    return this.getAccessTokenFromCode(code)
  }

  /** Exchange an authorization code for tokens. */
  public async getAccessTokenFromCode(code: string): Promise<string | null> {
    const codeVerifier = localStorage.getItem(this.verifierKey)
    if (!codeVerifier) {
      console.error(`${this.logPrefix} No PKCE code_verifier found in local storage.`)
      return null
    }

    const body: Record<string, string> = {
      code,
      client_id: this.config.clientId,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier
    }
    if (this.config.clientSecret) body.client_secret = this.config.clientSecret

    const tokenResponse = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body)
    })

    if (!tokenResponse.ok) {
      console.error(
        `${this.logPrefix} Error exchanging authorization code for access token:`,
        await tokenResponse.text()
      )
      return null
    }

    const tokenData = await tokenResponse.json()
    await this.persistTokens(tokenData)

    // The verifier is single-use; drop it so a stale one cannot be replayed.
    localStorage.removeItem(this.verifierKey)
    localStorage.removeItem(this.stateKey)

    // Strip the ?code= from the address bar so a reload does not replay it.
    window.history.replaceState({}, document.title, window.location.pathname)

    // Hydrate local stores now that we have a first access token (once per session)
    this.hydrateOnce()

    return tokenData.access_token as string
  }

  /** Forget every credential for this provider. */
  public async disconnect(): Promise<void> {
    if (!this.dbService) return
    // Allow a fresh hydration on the next reconnect
    this.hydrationDone = false
    this.refreshInFlight = null
    await this.dbService.deleteData(this.accessTokenKey)
    await this.dbService.deleteData(this.refreshTokenKey)
    await this.dbService.deleteData(this.expiryKey)
  }
}
