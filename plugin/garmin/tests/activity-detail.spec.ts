import { test, expect } from '@playwright/test'

const GARMIN_COOKIE = process.env.GARMIN_COOKIE || ''

const GARMIN_HEADERS = {
  Cookie: GARMIN_COOKIE,
  NK: 'NT',
  'X-app-ver': '4.70.2.0',
  'Di-Backend': 'connectapi.garmin.com'
}

test.describe('Garmin Connect — Activity Detail', () => {
  test.skip(!GARMIN_COOKIE, 'GARMIN_COOKIE env var not set')

  let activityId: string

  test.beforeAll(async ({ request }) => {
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

    const res = await request.get(
      `https://connectapi.garmin.com/activity-service/activity/search/activities?startDate=${startDate}&endDate=${endDate}&limit=1`,
      { headers: GARMIN_HEADERS }
    )

    const activities = await res.json()
    activityId = String(activities[0]?.activityId)
  })

  test('returns HTTP 200 for a valid activityId', async ({ request }) => {
    test.skip(!activityId, 'No activityId available')

    const res = await request.get(
      `https://connectapi.garmin.com/activity-service/activity/${activityId}`,
      { headers: GARMIN_HEADERS }
    )

    expect(res.status()).toBe(200)
  })

  test('has required detail fields', async ({ request }) => {
    test.skip(!activityId, 'No activityId available')

    const res = await request.get(
      `https://connectapi.garmin.com/activity-service/activity/${activityId}`,
      { headers: GARMIN_HEADERS }
    )

    const body = await res.json()

    expect(body).toHaveProperty('activityId')
    expect(body).toHaveProperty('duration')
    expect(body).toHaveProperty('distance')
    expect(body).toHaveProperty('averageHR')
  })
})
