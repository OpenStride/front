// tests/unit/HomeView.test.ts
import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import HomePage from '@/views/HomePage.vue'
import { useRouter } from 'vue-router'

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

describe.skip('HomePage', () => {
  const pushMock = vi.fn()
    ; (useRouter as any).mockReturnValue({ push: pushMock })

  it('affiche le texte principal', () => {
    const wrapper = shallowMount(HomePage)
    expect(wrapper.text()).toContain('Explorez. Contrôlez. Partagez.')
    expect(wrapper.text()).toContain('Respect de votre vie privée')
  })

  it('navigue vers /data-providers quand on clique sur Commencer maintenant', async () => {
    const wrapper = shallowMount(HomePage)
    const button = wrapper.find('button.cta-button')
    await button.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/data-providers')
  })

  it('navigue vers /backup-providers quand on clique sur "Configurer la sauvegarde"', async () => {
    const wrapper = shallowMount(HomePage)
    const buttons = wrapper.findAll('button')
    const backupButton = buttons.find(btn => btn.text().includes('sauvegarde'))
    expect(backupButton).toBeTruthy()
    await backupButton!.trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/backup-providers')
  })


})