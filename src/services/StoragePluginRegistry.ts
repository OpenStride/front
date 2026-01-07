import type { StoragePlugin } from '@/types/storage'

const modules = import.meta.glob('@plugins/storage-providers/**/client/index.ts', { eager: true }) as Record<string, { default: StoragePlugin }>

export const allStoragePlugins: StoragePlugin[] = Object.values(modules).map(mod => mod.default)