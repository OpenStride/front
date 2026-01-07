import { IndexedDBService } from "./IndexedDBService";
import { BackupService } from "./StorageService";


export class PublicDataService {
    private static instance: PublicDataService;
    private constructor() { }

    public static getInstance(): PublicDataService {
        if (!PublicDataService.instance) {
            PublicDataService.instance = new PublicDataService();
        }
        return PublicDataService.instance;
    }

    public async updatePublicData(): Promise<any> {
        const dbService = await IndexedDBService.getInstance();
        const publicData = {};
        if (publicData) {
            return publicData;
        } else {
            console.error('No public data found');
            return null;
        }
    }
}