import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import * as admin from 'firebase-admin'

let _app: admin.app.App | null = null
function getApp() {
  if (!_app) _app = admin.initializeApp()
  return _app
}

function getBucket() {
  return admin.storage(getApp()).bucket()
}

const GARMIN_CLIENT_ID = defineSecret('GARMIN_CLIENT_ID')
const GARMIN_CLIENT_SECRET = defineSecret('GARMIN_CLIENT_SECRET')
// Shared secret embedded in the Garmin push callback URL (/ping/<secret>).
// Only Garmin's registered callback knows it → blocks spoofed pushes.
const GARMIN_WEBHOOK_SECRET = defineSecret('GARMIN_WEBHOOK_SECRET')

// Pull providers (OAuth2 + REST pull). The client drives everything; the relay
// only injects the client secret at token exchange and adds CORS to API GETs —
// no data is buffered or stored. Add a provider by extending PULL_PROVIDERS below.
//
// Credentials are read lazily from process.env (optional) rather than bound
// Firebase secrets, so a provider stays dormant — and the deploy succeeds —
// until its env vars are provisioned. A missing credential yields a 503 at
// token exchange instead of blocking deployment.
interface ProviderConfig {
  tokenUrl: string
  apiBase: string
  clientId: () => string | undefined
  clientSecret: () => string | undefined
}

const PULL_PROVIDERS: Record<string, ProviderConfig> = {
  // Add OAuth2 REST pull providers here (e.g. Fitbit, Oura). Strava is NOT here:
  // it's a client-side ZIP-export import (its API terms are incompatible with
  // OpenStride), so it needs no relay.
}

const GARMIN_API = 'https://apis.garmin.com'
const PUSH_PREFIX = 'garmin_push'
// Max files returned per /push read. activityDetails files carry full sample
// arrays, so returning the whole buffer at once blows the response size limit.
// The client drains in a loop until the buffer is empty.
const MAX_PUSH_FILES = 5

// Browser origins allowed to call the proxy. This is defense-in-depth only —
// the real access gate is the Garmin Bearer token, validated per request.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'https://openstride.org',
  'https://openstrive-edd63.web.app',
  'https://openstrive-edd63.firebaseapp.com'
])

function corsHeaders(origin?: string): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'http://localhost:3000'
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}

// In-memory token→userId cache (per function instance). During an import the client
// polls /push many times with the same token; without this we'd hit Garmin's user/id
// endpoint on every poll, get rate-limited, and hang until the function times out.
const userIdCache = new Map<string, { userId: string; expires: number }>()
const USER_ID_TTL_MS = 10 * 60 * 1000
const USER_ID_TIMEOUT_MS = 10_000

/**
 * Resolve the authoritative Garmin userId from the caller's OAuth2 Bearer token.
 *
 * This is the ONLY source of truth for identity. A client never supplies its own
 * userId — we always derive it from the token by asking Garmin. This makes it
 * impossible for a user to read or delete another user's buffered data.
 *
 * Cached per instance and bounded by a hard timeout so a slow/rate-limited Garmin
 * call fails fast (→ 401 with CORS) instead of hanging into a CORS-less 500.
 *
 * Returns null when the token is missing or invalid.
 */
async function resolveUserId(authHeader?: string): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const cached = userIdCache.get(authHeader)
  if (cached && cached.expires > Date.now()) return cached.userId

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), USER_ID_TIMEOUT_MS)
  try {
    const res = await fetch(`${GARMIN_API}/partner-gateway/rest/user/id`, {
      headers: { Authorization: authHeader },
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = (await res.json()) as { userId?: string | number }
    if (data.userId == null) return null
    const userId = String(data.userId)
    userIdCache.set(authHeader, { userId, expires: Date.now() + USER_ID_TTL_MS })
    return userId
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Garmin OAuth2 proxy + secured push buffer.
 *
 * POST /token          → OAuth2 token exchange (injects client secret)
 * GET  /api/*          → proxy Garmin API calls (e.g. backfill trigger)
 * POST /ping/<secret>  → receive Garmin push, buffer as JSON in Cloud Storage
 * GET  /push           → owner-only: list this user's buffered push data (Bearer)
 * POST /push/consume   → owner-only: delete consumed files (Bearer)
 */
export const garminProxy = onRequest(
  {
    cors: true,
    secrets: [GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET, GARMIN_WEBHOOK_SECRET],
    region: 'europe-west1',
    memory: '1GiB'
  },
  async (req, res) => {
    const origin = req.headers.origin
    const cors = corsHeaders(origin)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(cors).status(204).send('')
      return
    }

    // POST /token — OAuth2 token exchange
    if (req.path === '/token' && req.method === 'POST') {
      try {
        const body =
          typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString()
        const params = new URLSearchParams(body)
        params.set('client_id', GARMIN_CLIENT_ID.value())
        params.set('client_secret', GARMIN_CLIENT_SECRET.value())

        const response = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        })

        const data = await response.text()
        res.set(cors).status(response.status).send(data)
      } catch (error: unknown) {
        console.error('[garminProxy] Token exchange error:', error)
        res.set(cors).status(500).json({ error: 'Token exchange failed' })
      }
      return
    }

    // POST /ping/<secret> — Receive Garmin push notifications (server-to-server).
    // Guarded by a shared secret in the path so only Garmin's registered callback
    // can write to the buffer. No CORS (not a browser caller).
    if (req.path.startsWith('/ping') && req.method === 'POST') {
      const providedSecret = req.path.slice('/ping'.length).replace(/^\//, '')
      if (!providedSecret || providedSecret !== GARMIN_WEBHOOK_SECRET.value()) {
        console.warn('[garminProxy] Rejected push with invalid webhook secret')
        res.status(403).send('Forbidden')
        return
      }

      try {
        const payload = req.body
        const types = Object.keys(payload)
        const counts = types.map(t => `${t}:${Array.isArray(payload[t]) ? payload[t].length : '?'}`)
        console.log(`[garminProxy] Push received: ${counts.join(', ')}`)

        let stored = 0

        for (const [summaryType, entries] of Object.entries(payload)) {
          if (!Array.isArray(entries)) continue

          for (const entry of entries) {
            const { userId, summaryId } = entry as { userId?: string; summaryId?: string }
            if (!userId) continue

            const fileName = summaryId
              ? `${PUSH_PREFIX}/${userId}/${summaryType}_${summaryId}.json`
              : `${PUSH_PREFIX}/${userId}/${summaryType}_${Date.now()}.json`

            const file = getBucket().file(fileName)
            await file.save(JSON.stringify(entry), {
              contentType: 'application/json',
              metadata: { metadata: { userId, summaryType, receivedAt: String(Date.now()) } }
            })
            stored++
          }
        }

        console.log(`[garminProxy] Buffered ${stored} files`)
        res.status(200).send('OK')
      } catch (error: unknown) {
        console.error('[garminProxy] Push error:', error)
        // Always 200 so Garmin does not retry-storm on our internal errors.
        res.status(200).send('OK')
      }
      return
    }

    // GET /push — Owner-only listing. The userId is derived from the Bearer token,
    // never taken from the request, so a caller can only ever see their own data.
    if (req.path === '/push' && req.method === 'GET') {
      const userId = await resolveUserId(req.headers.authorization)
      if (!userId) {
        res.set(cors).status(401).json({ error: 'Unauthorized' })
        return
      }

      try {
        const [allFiles] = await getBucket().getFiles({ prefix: `${PUSH_PREFIX}/${userId}/` })

        // Return at most MAX_PUSH_FILES per request to stay under the response size
        // limit; the client keeps polling until the buffer drains to empty.
        const files = allFiles.slice(0, MAX_PUSH_FILES)
        const result = await Promise.all(
          files.map(async file => {
            const [content] = await file.download()
            return { name: file.name, data: JSON.parse(content.toString()) }
          })
        )

        res.set(cors).json(result)
      } catch (error: unknown) {
        console.error('[garminProxy] Push list error:', error)
        res.set(cors).status(500).json({ error: 'Failed to list push data' })
      }
      return
    }

    // POST /push/consume — Owner-only delete of consumed files. Body: { files: string[] }.
    // Every filename is re-checked against the caller's own prefix, so the token
    // owner can only ever delete their own buffered data.
    if (req.path === '/push/consume' && req.method === 'POST') {
      const userId = await resolveUserId(req.headers.authorization)
      if (!userId) {
        res.set(cors).status(401).json({ error: 'Unauthorized' })
        return
      }

      try {
        const ownPrefix = `${PUSH_PREFIX}/${userId}/`
        const requested = req.body?.files as unknown as string[] | undefined
        const safe = Array.isArray(requested)
          ? requested.filter(f => typeof f === 'string' && f.startsWith(ownPrefix))
          : []

        await Promise.all(
          safe.map(f =>
            getBucket()
              .file(f)
              .delete()
              .catch(() => {})
          )
        )

        res.set(cors).json({ deleted: safe.length })
      } catch (error: unknown) {
        console.error('[garminProxy] Push consume error:', error)
        res.set(cors).status(500).json({ error: 'Failed to delete push data' })
      }
      return
    }

    // GET /api/* — Proxy Garmin API calls (e.g. backfill trigger). Token-gated by
    // Garmin itself; we only forward the caller's Authorization header.
    if (req.path.startsWith('/api/') && req.method === 'GET') {
      try {
        const garminPath = req.path.slice('/api/'.length)
        const queryString = new URLSearchParams(req.query as Record<string, string>).toString()
        const garminUrl = `${GARMIN_API}/wellness-api/rest/${garminPath}${queryString ? '?' + queryString : ''}`

        const headers: Record<string, string> = {}
        if (req.headers.authorization) {
          headers['Authorization'] = req.headers.authorization
        }

        const response = await fetch(garminUrl, { headers })
        const data = await response.text()
        console.log(`[garminProxy] GET ${garminUrl} → ${response.status}`)
        res.set(cors).status(response.status).send(data)
      } catch (error: unknown) {
        console.error('[garminProxy] API proxy error:', error)
        res.set(cors).status(502).json({ error: 'Garmin API proxy failed' })
      }
      return
    }

    // Generic pull-provider relay: POST /{provider}/token, GET /{provider}/api/*
    // (Garmin keeps its own dedicated routes above; those path prefixes are never
    // provider names, so there is no collision.)
    const seg = req.path.split('/').filter(Boolean)
    if (seg.length >= 2 && PULL_PROVIDERS[seg[0]]) {
      const cfg = PULL_PROVIDERS[seg[0]]

      // POST /{provider}/token — inject client id/secret, forward to the provider.
      if (seg[1] === 'token' && req.method === 'POST') {
        try {
          const clientId = cfg.clientId()
          const clientSecret = cfg.clientSecret()
          // Provider not provisioned yet (no env vars) → stay dormant.
          if (!clientId || !clientSecret) {
            res
              .set(cors)
              .status(503)
              .json({ error: `Provider "${seg[0]}" is not configured` })
            return
          }

          const body =
            typeof req.body === 'string' ? req.body : new URLSearchParams(req.body).toString()
          const params = new URLSearchParams(body)
          params.set('client_id', clientId)
          params.set('client_secret', clientSecret)

          const response = await fetch(cfg.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          })
          const data = await response.text()
          res.set(cors).status(response.status).send(data)
        } catch (error: unknown) {
          console.error(`[${seg[0]}Proxy] Token exchange error:`, error)
          res.set(cors).status(500).json({ error: 'Token exchange failed' })
        }
        return
      }

      // GET /{provider}/api/* — CORS proxy for the provider's REST API (Bearer forwarded).
      if (seg[1] === 'api' && req.method === 'GET') {
        try {
          const path = seg.slice(2).join('/')
          const queryString = new URLSearchParams(req.query as Record<string, string>).toString()
          const url = `${cfg.apiBase}/${path}${queryString ? '?' + queryString : ''}`
          const headers: Record<string, string> = {}
          if (req.headers.authorization) headers['Authorization'] = req.headers.authorization

          const response = await fetch(url, { headers })
          const data = await response.text()
          console.log(`[${seg[0]}Proxy] GET ${url} → ${response.status}`)
          res.set(cors).status(response.status).send(data)
        } catch (error: unknown) {
          console.error(`[${seg[0]}Proxy] API proxy error:`, error)
          res.set(cors).status(502).json({ error: 'API proxy failed' })
        }
        return
      }
    }

    res.set(cors).status(404).send('Not Found')
  }
)
