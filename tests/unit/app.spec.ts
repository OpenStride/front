import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '@/App.vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// Fake router for testing
const router = createRouter({
    history: createMemoryHistory(),
    routes: [
        {
            path: '/',
            component: {
                template: '<div>Page d’accueil</div>'
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
                plugins: [router]
            }
        })

        expect(wrapper.findComponent({ name: 'AppHeader' }).exists()).toBe(true)
        expect(wrapper.text().toLowerCase()).toContain('openstride') // si visible dans le header
        expect(wrapper.text().toLowerCase()).toContain('profile') // si visible dans le header
        expect(wrapper.text()).toContain('Page d’accueil')
    })
})
