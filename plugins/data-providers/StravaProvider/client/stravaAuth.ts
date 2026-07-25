import { getTokens, setTokens, type StravaTokens } from './storage'
import pluginEnv from './env'

interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number // epoch seconds
  expires_in: number
}

function parseTokenResponse(data: StravaTokenResponse): StravaTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // Strava returns absolute expiry (epoch seconds); fall back to expires_in.
    expiresAt: data.expires_at ? data.expires_at * 1000 : Date.now() + data.expires_in * 1000
  }
}

/** Exchange the OAuth authorization code for tokens via the CORS relay. */
export async function exchangeCodeForTokens(code: string): Promise<StravaTokens> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code })

  const res = await fetch(`${pluginEnv.proxyUrl}/strava/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Strava token exchange failed: ${res.status} - ${errorText.substring(0, 200)}`)
  }

  const tokens = parseTokenResponse(await res.json())
  await setTokens(tokens)
  return tokens
}

/** Refresh the access token using the stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<StravaTokens> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })

  const res = await fetch(`${pluginEnv.proxyUrl}/strava/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Strava token refresh failed: ${res.status} - ${errorText.substring(0, 200)}`)
  }

  const tokens = parseTokenResponse(await res.json())
  await setTokens(tokens)
  return tokens
}

/** Get a valid access token, refreshing if it expires within 5 minutes. */
export async function getValidAccessToken(): Promise<string> {
  const tokens = await getTokens()
  if (!tokens) throw new Error('No Strava tokens')

  const BUFFER_MS = 5 * 60 * 1000
  if (tokens.expiresAt - BUFFER_MS > Date.now()) return tokens.accessToken

  const refreshed = await refreshAccessToken(tokens.refreshToken)
  return refreshed.accessToken
}
