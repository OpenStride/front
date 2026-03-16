const pluginEnv = {
  proxyUrl:
    import.meta.env.VITE_GARMIN_PROXY_URL ||
    'https://garminproxy-openstrive-edd63.cloudfunctions.net',
  clientId: import.meta.env.VITE_GARMIN_CLIENT_ID || '',
  garminAuthUrl: 'https://connect.garmin.com/oauth2Confirm'
}

export default pluginEnv
