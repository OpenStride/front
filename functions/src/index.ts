import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

initializeApp()
const bucket = getStorage().bucket()

const GARMIN_CLIENT_ID = defineSecret('GARMIN_CLIENT_ID')
const GARMIN_CLIENT_SECRET = defineSecret('GARMIN_CLIENT_SECRET')

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

/**
 * Garmin OAuth2 proxy + push receiver.
 *
 * POST /token        → OAuth2 token exchange
 * GET  /api/*        → proxy wellness API calls
 * POST /ping         → receive Garmin push, store as JSON in Cloud Storage
 * GET  /push/:userId → client lists pending push files
 * DELETE /push/:userId → client cleans up consumed files
 */
export const garminProxy = onRequest(
  {
    cors: true,
    secrets: [GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET],
    region: 'europe-west1',
    memory: '1GiB'
  },
  async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.set(CORS_HEADERS).status(204).send('')
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
        res.set(CORS_HEADERS).status(response.status).send(data)
      } catch (error: unknown) {
        console.error('[garminProxy] Token exchange error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Token exchange failed' })
      }
      return
    }

    // POST /ping — Receive Garmin push notifications, store in Cloud Storage
    if (req.path === '/ping' && req.method === 'POST') {
      try {
        const payload = req.body
        const types = Object.keys(payload)
        const counts = types.map(t => `${t}:${Array.isArray(payload[t]) ? payload[t].length : '?'}`)
        console.log(`[garminProxy] Push received: ${counts.join(', ')}`)

        let stored = 0

        for (const [summaryType, entries] of Object.entries(payload)) {
          if (!Array.isArray(entries)) continue

          for (const entry of entries) {
            const { userId, summaryId } = entry as { userId: string; summaryId?: string }
            if (!userId) continue

            const fileName = summaryId
              ? `garmin_push/${userId}/${summaryType}_${summaryId}.json`
              : `garmin_push/${userId}/${summaryType}_${Date.now()}.json`

            const file = bucket.file(fileName)
            await file.save(JSON.stringify(entry), {
              contentType: 'application/json',
              metadata: { metadata: { userId, summaryType } }
            })
            stored++
          }
        }

        console.log(`[garminProxy] Stored ${stored} files in Cloud Storage`)
        res.status(200).send('OK')
      } catch (error: unknown) {
        console.error('[garminProxy] Push error:', error)
        res.status(200).send('OK')
      }
      return
    }

    // GET /push/:userId — Client lists pending push files
    if (req.path.startsWith('/push/') && req.method === 'GET') {
      try {
        const userId = req.path.slice('/push/'.length)
        if (!userId) {
          res.set(CORS_HEADERS).status(400).json({ error: 'Missing userId' })
          return
        }

        const [files] = await bucket.getFiles({ prefix: `garmin_push/${userId}/` })

        const result = await Promise.all(
          files.map(async file => {
            const [content] = await file.download()
            return {
              name: file.name,
              data: JSON.parse(content.toString())
            }
          })
        )

        res.set(CORS_HEADERS).json(result)
      } catch (error: unknown) {
        console.error('[garminProxy] Push list error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Failed to list push data' })
      }
      return
    }

    // DELETE /push/:userId — Client cleans up consumed files
    if (req.path.startsWith('/push/') && req.method === 'DELETE') {
      try {
        const userId = req.path.slice('/push/'.length)
        if (!userId) {
          res.set(CORS_HEADERS).status(400).json({ error: 'Missing userId' })
          return
        }

        const fileNames = req.body?.files as string[] | undefined

        if (fileNames && Array.isArray(fileNames)) {
          await Promise.all(
            fileNames.map(f =>
              bucket
                .file(f)
                .delete()
                .catch(() => {})
            )
          )
        } else {
          const [files] = await bucket.getFiles({ prefix: `garmin_push/${userId}/` })
          await Promise.all(files.map(f => f.delete().catch(() => {})))
        }

        res.set(CORS_HEADERS).json({ ok: true })
      } catch (error: unknown) {
        console.error('[garminProxy] Push delete error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Failed to delete push data' })
      }
      return
    }

    // GET /user-id — Resolve Garmin userId from stored push files
    if (req.path === '/user-id' && req.method === 'GET') {
      try {
        const [files] = await bucket.getFiles({ prefix: 'garmin_push/', maxResults: 1 })
        if (files.length > 0) {
          // Extract userId from path: garmin_push/{userId}/...
          const parts = files[0].name.split('/')
          if (parts.length >= 2) {
            res.set(CORS_HEADERS).json({ userId: parts[1] })
            return
          }
        }
        res.set(CORS_HEADERS).status(404).json({ error: 'No userId found' })
      } catch (error: unknown) {
        console.error('[garminProxy] User ID lookup error:', error)
        res.set(CORS_HEADERS).status(500).json({ error: 'Failed to resolve userId' })
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
