import { getTokens, setTokens, setGarminUserId, type GarminTokens } from './storage'
import pluginEnv from './env'

// 64 chars = power of 2, no modulo bias with Uint8Array (256 % 64 === 0)
const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// PKCE code verifier: 64 random chars
export function generateCodeVerifier(): string {
  const array = crypto.getRandomValues(new Uint8Array(64))
  return Array.from(array, b => VERIFIER_CHARS[b % VERIFIER_CHARS.length]).join('')
}

// SHA-256 hash -> base64url encoding
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const base64 = btoa(Array.from(new Uint8Array(hash), b => String.fromCharCode(b)).join(''))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseTokenResponse(data: any): GarminTokens {
  const now = Date.now()
  const FALLBACK_REFRESH_EXPIRES = 90 * 24 * 60 * 60 * 1000 // 90 days

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    refreshTokenExpiresAt:
      data.refresh_token_expires_in != null
        ? now + data.refresh_token_expires_in * 1000
        : now + FALLBACK_REFRESH_EXPIRES
  }
}

// Exchange authorization code for tokens via Firebase proxy
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<GarminTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri
  })

  const res = await fetch(`${pluginEnv.proxyUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Token exchange failed: ${res.status} - ${errorText.substring(0, 200)}`)
  }

  const data = await res.json()
  const tokens = parseTokenResponse(data)
  await setTokens(tokens)

  // Resolve and store Garmin userId from push data
  try {
    const userRes = await fetch(`${pluginEnv.proxyUrl}/user-id`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` }
    })
    if (userRes.ok) {
      const userData = await userRes.json()
      if (userData.userId) {
        await setGarminUserId(userData.userId)
      }
    }
  } catch {
    console.warn('[garminAuth] Could not resolve Garmin userId yet (will resolve on first push)')
  }

  return tokens
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string): Promise<GarminTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })

  const res = await fetch(`${pluginEnv.proxyUrl}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Token refresh failed: ${res.status} - ${errorText.substring(0, 200)}`)
  }

  const data = await res.json()
  const tokens = parseTokenResponse(data)
  await setTokens(tokens)
  return tokens
}

// Get a valid access token, refreshing if expired (5-min buffer)
export async function getValidAccessToken(): Promise<string> {
  const tokens = await getTokens()
  if (!tokens) throw new Error('No Garmin tokens')

  const ACCESS_BUFFER_MS = 5 * 60 * 1000 // 5 minutes before expiry
  const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000 // 24 hours before expiry

  if (tokens.expiresAt - ACCESS_BUFFER_MS > Date.now()) {
    return tokens.accessToken
  }

  if (
    isNaN(tokens.refreshTokenExpiresAt) ||
    tokens.refreshTokenExpiresAt - REFRESH_BUFFER_MS < Date.now()
  ) {
    throw new Error('Refresh token expired, re-authentication required')
  }

  const refreshed = await refreshAccessToken(tokens.refreshToken)
  return refreshed.accessToken
}
