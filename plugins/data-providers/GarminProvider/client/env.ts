const pluginEnv = {
    apiUrl: import.meta.env.MODE === 'production'
        ? 'https://garmin-jo37qzxfka-uc.a.run.app'
        : 'https://garmin-jo37qzxfka-uc.a.run.app'
}

export default pluginEnv