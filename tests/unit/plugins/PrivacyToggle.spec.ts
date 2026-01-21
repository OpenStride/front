import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PrivacyToggle from '@plugins/app-extensions/ActivityPrivacy/PrivacyToggle.vue'
import type { Activity, ActivityDetails } from '@/types/activity'
import { IndexedDBService } from '@/services/IndexedDBService'
import { FriendService } from '@/services/FriendService'

// Mock services
vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: {
    getInstance: vi.fn()
  }
}))

vi.mock('@/services/FriendService', () => ({
  FriendService: {
    getInstance: vi.fn()
  }
}))

vi.mock('@/services/ToastService', () => ({
  ToastService: {
    push: vi.fn()
  }
}))

describe('PrivacyToggle.vue', () => {
  const mockActivity: Activity = {
    id: 'test-1',
    startTime: Date.now(),
    distance: 5000,
    duration: 1800,
    type: 'running',
    provider: 'test',
    version: 1,
    lastModified: Date.now(),
    synced: false,
    deleted: false
  }

  const mockDetails: ActivityDetails = {
    id: 'test-1',
    samples: [],
    laps: [],
    stats: {
      averageSpeed: 2.78,
      totalAscent: 50,
      calories: 300
    },
    version: 1,
    lastModified: Date.now()
  }

  let mockDb: any
  let mockFriendService: any

  beforeEach(() => {
    // Mock IndexedDB service
    mockDb = {
      getData: vi.fn().mockResolvedValue(null),
      saveData: vi.fn().mockResolvedValue(undefined),
      deleteData: vi.fn().mockResolvedValue(undefined)
    }
    vi.mocked(IndexedDBService.getInstance).mockResolvedValue(mockDb)

    // Mock FriendService
    mockFriendService = {
      emitter: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      },
      publishPublicData: vi.fn().mockResolvedValue(undefined)
    }
    vi.mocked(FriendService.getInstance).mockReturnValue(mockFriendService)

    // Reset all mocks
    vi.clearAllMocks()
  })

  it('renders correctly with valid data', async () => {
    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    // Component should render
    expect(wrapper.vm).toBeDefined()
    expect(wrapper.find('.privacy-toggle-container').exists()).toBe(true)

    // Should show privacy card
    expect(wrapper.find('.privacy-card').exists()).toBe(true)
    expect(wrapper.find('.privacy-title').text()).toBe('Confidentialité')
  })

  it('handles undefined activity gracefully', () => {
    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: undefined as any,
          details: mockDetails
        }
      }
    })

    // Should not crash, but should not render
    expect(wrapper.vm).toBeDefined()
    expect(wrapper.find('.privacy-toggle-container').exists()).toBe(false)
  })

  it('handles activity with no id', () => {
    const activityWithoutId = {
      ...mockActivity,
      id: undefined as any
    }

    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: activityWithoutId,
          details: mockDetails
        }
      }
    })

    // Should not crash, but should not render
    expect(wrapper.vm).toBeDefined()
    expect(wrapper.find('.privacy-toggle-container').exists()).toBe(false)
  })

  it('loads privacy settings on mount', async () => {
    mockDb.getData.mockImplementation((key: string) => {
      if (key === 'defaultPrivacy') return Promise.resolve('public')
      if (key === 'activityPrivacy_test-1') return Promise.resolve('private')
      return Promise.resolve(null)
    })

    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    // Wait for async operations
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should load default privacy
    expect(mockDb.getData).toHaveBeenCalledWith('defaultPrivacy')
    // Should load activity-specific privacy
    expect(mockDb.getData).toHaveBeenCalledWith('activityPrivacy_test-1')
  })

  it('displays public state correctly', async () => {
    mockDb.getData.mockImplementation((key: string) => {
      if (key === 'activityPrivacy_test-1') return Promise.resolve('public')
      return Promise.resolve('private')
    })

    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should display public icon
    expect(wrapper.find('.fa-globe').exists()).toBe(true)
    expect(wrapper.find('.fa-lock').exists()).toBe(false)

    // Should display public text
    expect(wrapper.text()).toContain('Cette activité est publique')
  })

  it('displays private state correctly', async () => {
    mockDb.getData.mockResolvedValue('private')

    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should display lock icon
    expect(wrapper.find('.fa-lock').exists()).toBe(true)
    expect(wrapper.find('.fa-globe').exists()).toBe(false)

    // Should display private text
    expect(wrapper.text()).toContain('Cette activité est privée')
  })

  it('toggles privacy when button clicked', async () => {
    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    await wrapper.vm.$nextTick()

    // Click toggle button
    const toggleBtn = wrapper.find('.toggle-btn')
    await toggleBtn.trigger('click')

    // Wait for async operations
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should save privacy setting
    expect(mockDb.saveData).toHaveBeenCalledWith(
      'activityPrivacy_test-1',
      expect.any(String)
    )
  })

  it('handles mount and unmount lifecycle correctly', async () => {
    const wrapper = mount(PrivacyToggle, {
      props: {
        data: {
          activity: mockActivity,
          details: mockDetails
        }
      }
    })

    // Wait for mount lifecycle
    await wrapper.vm.$nextTick()

    // Component should be mounted without errors
    expect(wrapper.vm).toBeDefined()
    expect(wrapper.find('.privacy-toggle-container').exists()).toBe(true)

    // Unmount should not throw
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
