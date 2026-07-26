import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { ResolvedPluginPreference } from '@/types/plugin-preferences'

const mockListVisiblePreferences = vi.fn()
const mockSet = vi.fn()

vi.mock('@/services/PluginPreferencesRegistry', () => ({
  listVisiblePreferences: () => mockListVisiblePreferences()
}))

vi.mock('@/services/PluginPreferencesService', () => ({
  PluginPreferencesService: {
    getInstance: () => ({ set: mockSet })
  }
}))

import PluginPreferencesSection from '@/components/profile/PluginPreferencesSection.vue'

const selectPreference: ResolvedPluginPreference = {
  storageKey: 'publicFileProvider',
  pluginId: 'gdrive',
  pluginLabel: 'Google Drive',
  value: 'gdrive',
  options: [
    { value: 'gdrive', label: 'Google Drive' },
    { value: 'dropbox', label: 'Dropbox' }
  ],
  declaration: {
    key: 'publicFileProvider',
    shared: true,
    default: 'gdrive',
    label: 'preferences.publicFileProvider.label',
    description: 'preferences.publicFileProvider.description',
    type: 'select'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSet.mockResolvedValue(undefined)
})

describe('PluginPreferencesSection', () => {
  it('renders a declared select with its resolved options', async () => {
    mockListVisiblePreferences.mockResolvedValue([selectPreference])

    const wrapper = mount(PluginPreferencesSection)
    await flushPromises()

    const select = wrapper.get('[data-test="plugin-preference-publicFileProvider"]')
    expect(select.findAll('option').map(o => o.text())).toEqual(['Google Drive', 'Dropbox'])
    // The declaration label is an i18n key and must not leak to the screen.
    expect(wrapper.text()).not.toContain('preferences.publicFileProvider.label')
  })

  it('shows the owning plugin next to the preference', async () => {
    mockListVisiblePreferences.mockResolvedValue([selectPreference])

    const wrapper = mount(PluginPreferencesSection)
    await flushPromises()

    expect(wrapper.text()).toContain('Google Drive')
  })

  it('persists a change under the resolved storage key', async () => {
    mockListVisiblePreferences.mockResolvedValue([selectPreference])

    const wrapper = mount(PluginPreferencesSection)
    await flushPromises()

    const select = wrapper.get('[data-test="plugin-preference-publicFileProvider"]')
    await select.setValue('dropbox')
    await flushPromises()

    expect(mockSet).toHaveBeenCalledWith('publicFileProvider', 'dropbox')
  })

  it('renders nothing when no plugin declares a visible preference', async () => {
    mockListVisiblePreferences.mockResolvedValue([])

    const wrapper = mount(PluginPreferencesSection)
    await flushPromises()

    expect(wrapper.find('[data-test="plugin-preferences"]').exists()).toBe(false)
  })

  it('renders a checkbox for a boolean preference', async () => {
    mockListVisiblePreferences.mockResolvedValue([
      {
        storageKey: 'myPlugin.autoPublish',
        pluginId: 'myPlugin',
        pluginLabel: 'My Plugin',
        value: true,
        options: [],
        declaration: { key: 'autoPublish', default: false, label: 'Auto publish', type: 'boolean' }
      }
    ])

    const wrapper = mount(PluginPreferencesSection)
    await flushPromises()

    const checkbox = wrapper.get('[data-test="plugin-preference-myPlugin.autoPublish"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)

    await checkbox.setValue(false)
    await flushPromises()

    expect(mockSet).toHaveBeenCalledWith('myPlugin.autoPublish', false)
  })

  it('survives a registry failure without breaking the preferences screen', async () => {
    mockListVisiblePreferences.mockRejectedValue(new Error('boom'))

    const wrapper = mount(PluginPreferencesSection)
    await flushPromises()

    expect(wrapper.find('[data-test="plugin-preferences"]').exists()).toBe(false)
  })
})
