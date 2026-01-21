// tests/unit/HomeView.test.ts
import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import HomePage from '@/views/HomePage.vue'
import { useRouter } from 'vue-router'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'

// Mock Firebase messaging to avoid browser API errors in test environment
vi.mock('@/lib/firebase', () => ({
  messaging: {}
}))

// Mock IndexedDBService to avoid real IndexedDB access
vi.mock('@/services/IndexedDBService', () => ({
  IndexedDBService: class {
    static instance = null
    static async getInstance() {
      if (!this.instance) {
        this.instance = new this()
      }
      return this.instance
    }
    async getData() { return null }
    async saveData() { }
    async getAllData() { return [] }
  }
}))

// Mock du useRouter avec imports partiels pour éviter les erreurs de router
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    useRouter: vi.fn()
  }
})

// Create i18n instance for tests
const i18n = createI18n({
  legacy: false,
  locale: 'fr',
  fallbackLocale: 'en',
  messages: { en, fr }
})

// TODO: Update tests to match new HomePage (activity feed instead of landing page)
// Current tests are for the old landing page version which has been replaced
// by an activity feed with social features
describe.skip('HomePage - Tests need to be updated for new feed-based version', () => {
  const pushMock = vi.fn()
    ; (useRouter as any).mockReturnValue({ push: pushMock })

  it('should render activity feed when user has activities', () => {
    // TODO: Test new activity feed functionality
  })

  it('should show WelcomeLanding for new users', () => {
    // TODO: Test WelcomeLanding component rendering
  })

  it('should display stats bar with counts', () => {
    // TODO: Test stats bar with own/friends/total counts
  })
})
