const pluginEnv = {
  proxyUrl:
    import.meta.env.VITE_GARMIN_PROXY_URL ||
    'https://europe-west1-openstrive-edd63.cloudfunctions.net/garminProxy',
  clientId: import.meta.env.VITE_GARMIN_CLIENT_ID || '',
  garminAuthUrl: 'https://connect.garmin.com/oauth2Confirm'
}

export default pluginEnv
