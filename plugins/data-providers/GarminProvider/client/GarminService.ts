// services/GarminService.ts
import pluginEnv from './env'
import { adaptGarminSummary, adaptGarminDetails } from './adapter'
import { getActivityService } from '@/services/ActivityService'
import { getIndexedDBService } from '@/services/IndexedDBService'

const baseURL = pluginEnv.apiUrl

/**
 * Récupère les activités au jour le jour et les stocke.
 * onProgress(pct, msg) est appelé après chaque jour.
 */
export async function fetchActivities(
    days: number,
    onProgress?: (percent: number, message: string) => void
): Promise<number> {
    const dbService = await getIndexedDBService()
    const activityService = await getActivityService()
    const token = await dbService.getData('garmin_token')
    const secret = await dbService.getData('garmin_token_secret')
    if (!token || !secret) throw new Error('Token Garmin manquant.')

    const now = new Date()
    let totalCount = 0

    for (let i = 0; i < days; i++) {
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59, 999)
        const start = new Date(end)
        start.setDate(start.getDate() - 1)

        const startTime = start.toISOString()
        const endTime = end.toISOString()
        const url = `${baseURL}/activities/fetch?oauth_token=${token}&oauth_token_secret=${secret}&start_time=${startTime}&end_time=${endTime}&detail=1`

        try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(res.statusText)
            const raw = await res.json()
            const summaries = raw.map(adaptGarminSummary)
            const details = raw.map(adaptGarminDetails)

            // ✅ Atomic transaction: both succeed or both fail
            await activityService.saveActivitiesWithDetails(summaries, details)

            totalCount += summaries.length
            const pct = Math.round(((i + 1) / days) * 100)
            onProgress?.(pct, `✅ Jour ${i + 1}/${days} : ${summaries.length} activités`)
        } catch (err: any) {
            console.error(`❌ Jour ${i + 1} erreur:`, err)
            const pct = Math.round(((i + 1) / days) * 100)
            onProgress?.(pct, `❌ Jour ${i + 1} : erreur`)
        }
        // légère pause pour éviter de spammer l'API
        await sleep(200)
    }

    return totalCount
}

/**
 * Récupère en une seule passe un large intervalle (backfill).
 * onProgress est appelé aux grandes étapes.
 */
export async function backFillActivities(
    startDate: Date,
    endDate: Date,
    onProgress?: (percent: number, message: string) => void
): Promise<number> {
    const dbService = await getIndexedDBService()
    const activityService = await getActivityService()
    const token = await dbService.getData('garmin_token')
    const secret = await dbService.getData('garmin_token_secret')
    if (!token || !secret) throw new Error('Token Garmin manquant.')

    onProgress?.(0, `🔄 Backfill du ${startDate.toLocaleDateString()} au ${endDate.toLocaleDateString()}`)

    const startTime = startDate.toISOString()
    const endTime = endDate.toISOString()
    const url = `${baseURL}/activities/fetch?oauth_token=${token}&oauth_token_secret=${secret}&start_time=${startTime}&end_time=${endTime}&detail=1&backfill=1`

    onProgress?.(10, '📥 Envoi de la requête backfill…')
    const res = await fetch(url)
    if (!res.ok) throw new Error(res.statusText)

    onProgress?.(50, '⚙️ Traitement des données reçues…')
    const raw = await res.json()
    const summaries = raw.map(adaptGarminSummary)
    const details = raw.map(adaptGarminDetails)

    onProgress?.(80, '💾 Sauvegarde en base…')
    // ✅ Atomic transaction: both succeed or both fail
    await activityService.saveActivitiesWithDetails(summaries, details)

    onProgress?.(100, `✅ Backfill terminé : ${summaries.length} activités`)
    return summaries.length
}

/**
 * Orchestration : choisit entre fetch et backfill et remonte une progression globale.
 */
export async function GarminRefresh(
    days: number = 7,
    onProgress?: (percent: number, message: string) => void
): Promise<void> {
    onProgress?.(0, '🚀 Démarrage')

    if (days <= 7) {
        onProgress?.(5, `⌛ Fetch des ${days} derniers jours…`)
        const count = await fetchActivities(days, (subPct, subMsg) => {
            // on passe de 5→95% selon subPct
            const overall = 5 + Math.round(subPct * 0.9)
            onProgress?.(overall, subMsg)
        })
        onProgress?.(100, `🎉 Terminé : ${count} activités`)
    } else {
        onProgress?.(5, '⏳ Calcul backfill…')
        const start = new Date()
        start.setDate(start.getDate() - days - 31)
        const end = new Date()
        end.setDate(end.getDate() - 31)

        const count = await backFillActivities(start, end, (subPct, subMsg) => {
            // on passe de 5→95% selon subPct
            const overall = 5 + Math.round(subPct * 0.9)
            onProgress?.(overall, subMsg)
        })
        // à la fin d'un backfill on attend 3s et on relance un fetch pour recuperer le backfill
        onProgress?.(95, '⏳ Attente de 3 secondes pour finaliser le backfill…')
        await sleep(3000)
        onProgress?.(98, '🔄 Récupération des dernières activités…')
        await fetchActivities(days, (subPct, subMsg) => {
            // on passe de 5→95% selon subPct
            const overall = 5 + Math.round(subPct * 0.9)
            onProgress?.(overall, subMsg)
        })
        onProgress?.(100, `🎉 Backfill complet : ${count} activités`)
    }
}

// helper
function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
}
