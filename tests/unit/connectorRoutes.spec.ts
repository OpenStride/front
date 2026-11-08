import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent } from 'vue'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerConnectorRoutes } from '@/services/ConnectorRoutes'

const Stub = defineComponent({ template: '<div />' })

describe('the pages of data and storage plugins', () => {
  it('serves the Garmin callback at the address registered with Garmin', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: Stub }]
    })
    registerConnectorRoutes(router)

    const route = router.resolve('/oauth/garmin/callback?code=x&state=y')
    expect(route.name).toBe('GarminOAuthCallback')
  })

  it('leaves the core without any page or token of a given provider', () => {
    const router = readFileSync(join(__dirname, '../../src/router/index.ts'), 'utf8')
    expect(router).not.toMatch(/garmin|callback/i)

    const onboarding = readFileSync(
      join(__dirname, '../../src/views/onboarding/OnboardingStorageStep.vue'),
      'utf8'
    )
    expect(onboarding).not.toMatch(/gdrive_/)
  })
})
