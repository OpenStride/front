import { Activity, ActivityDetails } from '@/types/activity'
import { IndexedDBService } from './IndexedDBService'

let instance: ActivityDBService | null = null

export class ActivityDBService {
    constructor(private db: IndexedDBService) { }

    async saveActivities(activities: Activity[]): Promise<void> {
        return this.db.addItemsToStore('activities', activities, (a) => a.id)
    }

    async saveDetails(details: ActivityDetails[]): Promise<void> {
        return this.db.addItemsToStore('activity_details', details, (d) => d.id)
    }

    async getActivities(params: { offset?: number; limit?: number } = {}): Promise<Activity[]> {
        const { offset = 0, limit = 10 } = params;
        const all = await this.db.getAllData('activities');
        return all
            .sort((a, b) => b.startTime - a.startTime)
            .slice(offset, offset + limit);
    }

    async getActivity(id: string): Promise<Activity | null> {
        return await this.db.getDataFromStore('activities', id)
    }

    async getDetails(id: string): Promise<ActivityDetails | null> {
        return await this.db.getDataFromStore('activity_details', id)
    }
}

// 🔁 Singleton async getter
export async function getActivityDBService(): Promise<ActivityDBService> {
    if (!instance) {
        const db = await IndexedDBService.getInstance()
        instance = new ActivityDBService(db)
    }
    return instance
}
