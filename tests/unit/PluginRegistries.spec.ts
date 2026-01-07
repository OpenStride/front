import { describe, it, expect } from 'vitest'
import { allProviderPlugins } from '@/services/ProviderPluginRegistry'
import { allStoragePlugins } from '@/services/StoragePluginRegistry'
import { allAppPlugins, getPluginViewsForSlot } from '@/services/ExtensionPluginRegistry'

describe('Plugin registries', () => {
  it('chargent les tableaux (peuvent être vides mais définis)', () => {
    expect(Array.isArray(allProviderPlugins)).toBe(true)
    expect(Array.isArray(allStoragePlugins)).toBe(true)
    expect(Array.isArray(allAppPlugins)).toBe(true)
  })

  it('ids provider uniques', () => {
    const ids = allProviderPlugins.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ExtensionPluginRegistry.getPluginViewsForSlot', () => {
  it('retourne un tableau (async)', async () => {
    const views = await getPluginViewsForSlot('activity.widgets')
    expect(Array.isArray(views)).toBe(true)
  })
})
