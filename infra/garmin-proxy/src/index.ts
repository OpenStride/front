interface Env {
  GARMIN_CLIENT_ID: string
  GARMIN_CLIENT_SECRET: string
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

// Headers that must not be forwarded between hops
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade'
])

function forwardHeaders(source: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  source.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out[k] = v
  })
  return { ...out, ...CORS_HEADERS }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    if (url.pathname === '/token' && request.method === 'POST') {
      const body = await request.text()
      const params = new URLSearchParams(body)
      params.set('client_id', env.GARMIN_CLIENT_ID)
      params.set('client_secret', env.GARMIN_CLIENT_SECRET)

      const res = await fetch('https://diauth.garmin.com/di-oauth2-service/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })

      return new Response(res.body, {
        status: res.status,
        headers: forwardHeaders(res.headers)
      })
    }

    if (url.pathname.startsWith('/api/') && request.method === 'GET') {
      const garminPath = url.pathname.slice('/api/'.length)
      const garminUrl = `https://apis.garmin.com/wellness-api/rest/${garminPath}${url.search}`

      const res = await fetch(garminUrl, {
        headers: { Authorization: request.headers.get('Authorization') || '' }
      })

      return new Response(res.body, {
        status: res.status,
        headers: forwardHeaders(res.headers)
      })
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS })
  }
}
