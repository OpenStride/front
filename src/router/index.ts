import { createRouter, createWebHistory } from 'vue-router'
import { ONBOARDING_STATE_KEY, type OnboardingState } from '@/types/onboarding'
import ProfilePage from '@/views/ProfilePage.vue'
import ActivityDetails from '@/views/ActivityDetails.vue'
import HomePage from '@/views/HomePage.vue'
import LandingPage from '@/views/LandingPage.vue'
import OnboardingFlow from '@/views/onboarding/OnboardingFlow.vue'
import LegalPage from '@/views/LegalPage.vue'
import CGUPage from '@/views/CGUPage.vue'
import Callback from '@/views/Callback.vue'
import GarminOAuthCallback from '@/views/GarminOAuthCallback.vue'
import FriendsPage from '@/views/FriendsPage.vue'
import AddFriendPage from '@/views/AddFriendPage.vue'
import { getActivityService } from '@/services/ActivityService'
import { IndexedDBService } from '@/services/IndexedDBService'

const routes = [
  { path: '/', component: HomePage },
  { path: '/welcome', component: LandingPage },
  { path: '/onboarding', component: OnboardingFlow },
  { path: '/legal', component: LegalPage },
  { path: '/cgu', component: CGUPage },
  { path: '/callback', component: Callback },
  {
    path: '/oauth/garmin/callback',
    name: 'GarminOAuthCallback',
    component: GarminOAuthCallback
  },
  { path: '/friends', component: FriendsPage },
  {
    path: '/add-friend',
    name: 'AddFriend',
    component: AddFriendPage,
    meta: {
      title: 'Ajouter un ami - OpenStride',
      requiresAuth: false
    }
  },
  {
    // Legacy alias kept for links shared before /activity-details existed. Its
    // param used to be named `parameter`, which useActivityDetails never reads,
    // so every one of those links landed on "activity not found".
    path: '/history/:activityId?',
    component: ActivityDetails,
    name: 'History'
  },
  {
    path: '/activity-details/:activityId',
    component: ActivityDetails,
    name: 'ActivityDetails'
  },
  { path: '/profile', component: ProfilePage },
  {
    path: '/data-provider/:id',
    name: 'ProviderSetup',
    component: () => import('@/views/ProviderSetupView.vue')
  },
  {
    path: '/storage-provider/:id',
    name: 'StoragePluginSetup',
    component: () => import('@/views/StorageSetupView.vue')
  },
  // Redirects for backward compatibility
  // `/my-activities` was a searchable list next to the feed on `/`, showing the
  // same cards in the same order for anyone without friends. One list now, on
  // the app root; the old path keeps every link that was shared to it.
  { path: '/my-activities', redirect: '/' },
  { path: '/data-providers', redirect: '/profile?tab=data-sources' },
  { path: '/storage-providers', redirect: '/profile?tab=cloud-backup' },
  { path: '/app-extensions', redirect: '/profile?tab=app-extensions' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  // Empêcher accès à /onboarding si déjà complété
  if (to.path === '/onboarding') {
    const db = await IndexedDBService.getInstance()
    const state = await db.getData<OnboardingState>(ONBOARDING_STATE_KEY)
    if (state?.completed) {
      return next('/')
    }
  }

  /**
   * `/` is the feed for someone who has data, and the pitch for someone who
   * has none.
   *
   * The check below already existed and its answer was thrown away, so a first
   * visitor to openstride.org landed on the feed's empty state — a page that
   * says what is missing without ever saying what the product is.
   *
   * `/welcome` bounces the other way so the pitch is never a dead end for
   * someone who already imported.
   */
  if (to.path === '/' || to.path === '/welcome') {
    const wantsFeed = await hasAnyActivity()
    const destination = wantsFeed ? '/' : '/welcome'
    return destination === to.path ? next() : next(destination)
  }

  next() // continue normalement
})

async function hasAnyActivity(): Promise<boolean> {
  const activityService = await getActivityService()
  const own = await activityService.getActivities({ limit: 1, offset: 0 })
  if (own.length > 0) return true

  const db = await IndexedDBService.getInstance()
  const friendActivities = await db.getAllData('friend_activities')
  return friendActivities.length > 0
}

export default router
