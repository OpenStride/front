const pluginEnv = {
  proxyUrl: import.meta.env.VITE_GARMIN_PROXY_URL || 'https://garmin-proxy.openstride.workers.dev',
  clientId: import.meta.env.VITE_GARMIN_CLIENT_ID || '',
  garminAuthUrl: 'https://connect.garmin.com/oauth2Confirm'
}

export default pluginEnv
