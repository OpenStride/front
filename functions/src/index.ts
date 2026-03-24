import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp()
const db = getFirestore()

const GARMIN_CLIENT_ID = defineSecret('GARMIN_CLIENT_ID')
const GARMIN_CLIENT_SECRET = defineSecret('GARMIN_CLIENT_SECRET')

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

/**
 * Garmin OAuth2 proxy + ping receiver.
 *
 * POST /token       → OAuth2 token exchange
 * GET  /api/*       → proxy wellness API calls
 * POST /ping        → receive Garmin ping notifications, store callback URLs
 * GET  /callbacks/* → client fetches pending callbacks for a userId
 * DELETE /callbacks/* → client cleans up consumed callbacks
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

    // POST /ping — Receive Garmin ping notifications
    // Garmin sends: { "activityDetails": [{ "userId": "xxx", "callbackURL": "https://..." }] }
    if (req.path === '/ping' && req.method === 'POST') {
      try {
        const payload = req.body
        console.log('[garminProxy] Ping received:', JSON.stringify(payload).substring(0, 500))

        const batch = db.batch()
        let count = 0

        // Iterate all summary types in the ping notification
        for (const [summaryType, entries] of Object.entries(payload)) {
          if (!Array.isArray(entries)) continue

          for (const entry of entries) {
            const { userId, callbackURL } = entry as { userId: string; callbackURL: string }
            if (!userId || !callbackURL) continue

            const docRef = db.collection('garmin_callbacks').doc()
            batch.set(docRef, {
              userId,
              callbackURL,
              summaryType,
              createdAt: Date.now(),
              // Auto-expire after 7 days (cleaned up by client or TTL policy)
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
            })
            count++
          }
        }

        if (count > 0) {
          await batch.commit()
          console.log(`[garminProxy] Stored ${count} callbacks`)
        }

        // Garmin requires 200 OK response
        res.status(200).send('OK')
      } catch (error: unknown) {
        console.error('[garminProxy] Ping error:', error)
        res.status(200).send('OK') // Always 200 to Garmin to avoid retry storms
      }
      return
    }

    // GET /callbacks/:userId — Client fetches pending callback URLs
    if (req.path.startsWith('/callbacks/') && req.method === 'GET') {
      try {
        const userId = req.path.slice('/callbacks/'.length)
        if (!userId) {
          res.set(CORS_HEADERS).status(400).json({ error: 'Missing userId' })
          return
        }

        const snapshot = await db
          .collection('garmin_callbacks')
          .where('userId', '==', userId)
          .where('expiresAt', '>', Date.now())
          .orderBy('createdAt', 'asc')
          .limit(50)
          .get()

        const callbacks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))

        res.set(CORS_HEADERS).json(callbacks)
      } catch (error: unknown) {
        console.error('[garminProxy] Callbacks fetch error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Failed to fetch callbacks' })
      }
      return
    }

    // DELETE /callbacks/:userId — Client cleans up consumed callbacks
    if (req.path.startsWith('/callbacks/') && req.method === 'DELETE') {
      try {
        const userId = req.path.slice('/callbacks/'.length)
        if (!userId) {
          res.set(CORS_HEADERS).status(400).json({ error: 'Missing userId' })
          return
        }

        // Delete by specific IDs if provided, otherwise all for user
        const ids = req.body?.ids as string[] | undefined

        if (ids && Array.isArray(ids)) {
          const batch = db.batch()
          for (const id of ids) {
            batch.delete(db.collection('garmin_callbacks').doc(id))
          }
          await batch.commit()
        } else {
          const snapshot = await db
            .collection('garmin_callbacks')
            .where('userId', '==', userId)
            .get()
          const batch = db.batch()
          snapshot.docs.forEach(doc => batch.delete(doc.ref))
          await batch.commit()
        }

        res.set(CORS_HEADERS).json({ ok: true })
      } catch (error: unknown) {
        console.error('[garminProxy] Callbacks delete error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Failed to delete callbacks' })
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

        console.log(`[garminProxy] GET ${garminUrl} auth=${!!req.headers.authorization}`)

        const response = await fetch(garminUrl, { headers })

        const data = await response.text()
        console.log(`[garminProxy] Response: ${response.status} ${data.substring(0, 200)}`)
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
