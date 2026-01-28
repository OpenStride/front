import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'

// Mock global constants
;(global as any).__APP_VERSION__ = '0.1.0'
;(global as any).__BUILD_TIME__ = '2026-01-23T00:00:00.000Z'

// Create i18n instance for tests
const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en, fr }
})

// Fake router for testing
const router = createRouter({
    history: createMemoryHistory(),
    routes: [
        {
            path: '/',
            component: {
                template: '<div>Home Page</div>'
            }
        }
    ]
})

describe('App.vue global layout', () => {
    it('affiche le header et la route par défaut', async () => {
        router.push('/')
        await router.isReady()

        const wrapper = mount(App, {
            global: {
                plugins: [router, i18n]
            }
        })

        expect(wrapper.findComponent({ name: 'AppHeader' }).exists()).toBe(true)
        expect(wrapper.text().toLowerCase()).toContain('openstride') // si visible dans le header
        expect(wrapper.text().toLowerCase()).toContain('profile') // si visible dans le header
        expect(wrapper.text()).toContain('Home Page')
    })
})
