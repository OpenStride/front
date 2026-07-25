// Strava is a pull provider: the browser fetches data through the shared CORS
// relay (same Firebase function as Garmin) and stores it in IndexedDB. Nothing
// is buffered server-side. clientId is public (used in the authorize URL); the
// client secret lives only in the relay.
const pluginEnv = {
  proxyUrl:
    import.meta.env.VITE_GARMIN_PROXY_URL ||
    'https://europe-west1-openstrive-edd63.cloudfunctions.net/garminProxy',
  clientId: import.meta.env.VITE_STRAVA_CLIENT_ID || '',
  authUrl: 'https://www.strava.com/oauth/authorize'
}

export default pluginEnv
