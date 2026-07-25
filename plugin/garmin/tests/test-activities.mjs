/**
 * Test: Garmin Connect API — Activities
 * Usage: GARMIN_COOKIE="..." node plugin/garmin/tests/test-activities.mjs
 */
const GARMIN_COOKIE = process.env.GARMIN_COOKIE
if (!GARMIN_COOKIE) {
  console.error('GARMIN_COOKIE env var not set')
  process.exit(1)
}

const HEADERS = {
  Cookie: GARMIN_COOKIE,
  NK: 'NT',
  'X-app-ver': '4.70.2.0',
  'Di-Backend': 'connectapi.garmin.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`)
    passed++
  } else {
    console.error(`  FAIL: ${message}`)
    failed++
  }
}

async function main() {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  console.log(`\nTest: getActivities (${startDate} to ${endDate})`)
  console.log('---')

  const url = `https://connectapi.garmin.com/activity-service/activity/search/activities?startDate=${startDate}&endDate=${endDate}&limit=20`

  const res = await fetch(url, { headers: HEADERS })

  assert(res.status === 200, `HTTP status is 200 (got ${res.status})`)

  if (res.status !== 200) {
    const text = await res.text()
    console.error('  Response:', text.substring(0, 300))
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(failed > 0 ? 1 : 0)
  }

  const activities = await res.json()

  assert(Array.isArray(activities), 'Response is an array')
  assert(activities.length > 0, `Activities found: ${activities.length}`)

  if (activities.length > 0) {
    const first = activities[0]
    assert(first.activityId !== undefined, 'activityId present')
    assert(first.startTimeLocal !== undefined, 'startTimeLocal present')
    assert(first.duration !== undefined, 'duration present')

    console.log(`\n  First activity: ${first.activityName} (${first.activityId})`)

    // Test activity detail
    console.log(`\nTest: getActivityDetails (${first.activityId})`)
    console.log('---')

    const detailUrl = `https://connectapi.garmin.com/activity-service/activity/${first.activityId}`
    const detailRes = await fetch(detailUrl, { headers: HEADERS })

    assert(detailRes.status === 200, `Detail HTTP status is 200 (got ${detailRes.status})`)

    if (detailRes.status === 200) {
      const detail = await detailRes.json()
      assert(detail.activityId !== undefined, 'detail activityId present')
      assert(detail.duration !== undefined, 'detail duration present')
      assert(detail.distance !== undefined, 'detail distance present')
      assert(detail.averageHR !== undefined, 'detail averageHR present')
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
