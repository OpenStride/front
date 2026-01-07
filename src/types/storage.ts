export interface StoragePlugin {
    id: string
    label: string
    icon?: string
    description?: string
    setupComponent: () => Promise<any>
    //syncData: (onlystores?: string[] | null) => Promise<any>
    readRemote(store: string): Promise<any[]>;
    writeRemote(store: string, data: any[]): Promise<void>;
    /**
     * Optional: plugin can provide a manifest update step after a sync.
     * Receives per-store summary and aggregate hash.
     */
    updateManifest?(summary: Array<{ name: string; itemCount: number; lastModified: number; contentHash: string }>, aggregateHash: string): Promise<void>;
    /**
     * Optional: plugin can optimize which stores really need import based on a remote manifest.
     * Returns the list of stores that should actually be fetched.
     */
    optimizeImport?(requestedStores: string[]): Promise<string[]>;
    /**
     * Optional: provide lightweight remote manifest (content hashes) so core can skip full remote reads
     * when local hash matches remote.
     */
    getRemoteManifest?(): Promise<{ stores: Array<{ name: string; contentHash: string; lastModified?: number; itemCount?: number }> } | null>;
}