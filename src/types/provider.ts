export interface ProviderPlugin {
    id: string
    label: string
    icon?: string
    description?: string
    setupComponent: () => Promise<any>
    refreshData?: () => Promise<any>
}