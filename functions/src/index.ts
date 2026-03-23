import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const GARMIN_CLIENT_ID = defineSecret('GARMIN_CLIENT_ID')
const GARMIN_CLIENT_SECRET = defineSecret('GARMIN_CLIENT_SECRET')

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

/**
 * Garmin OAuth2 proxy — injects client credentials and forwards requests.
 *
 * POST /token  → exchange code or refresh token via diauth.garmin.com
 * GET  /api/*  → proxy wellness API calls to apis.garmin.com
 */
export const garminProxy = onRequest(
  {
    cors: true,
    secrets: [GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET],
    region: 'europe-west1'
  },
  async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(CORS_HEADERS).status(204).send('')
      return
    }

    // POST /token — OAuth2 token exchange (code → tokens, refresh → tokens)
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
        res.set(CORS_HEADERS).status(response.status).send(data)
      } catch (error: unknown) {
        console.error('[garminProxy] Token exchange error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Token exchange failed' })
      }
      return
    }

    // GET /api/* — Proxy wellness API calls
    if (req.path.startsWith('/api/') && req.method === 'GET') {
      try {
        const garminPath = req.path.slice('/api/'.length)
        const queryString = new URLSearchParams(req.query as Record<string, string>).toString()
        const garminUrl = `https://apis.garmin.com/wellness-api/rest/${garminPath}${queryString ? '?' + queryString : ''}`

        const headers: Record<string, string> = {}
        if (req.headers.authorization) {
          headers['Authorization'] = req.headers.authorization
        }

        const response = await fetch(garminUrl, { headers })

        const data = await response.text()
        res.set(CORS_HEADERS).status(response.status).send(data)
      } catch (error: unknown) {
        console.error('[garminProxy] API proxy error:', error)
        res.set(CORS_HEADERS).status(502).json({ error: 'Garmin API proxy failed' })
      }
      return
    }

    res.set(CORS_HEADERS).status(404).send('Not Found')
  }
)
