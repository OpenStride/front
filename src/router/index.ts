import { createRouter, createWebHistory } from 'vue-router'
import { ONBOARDING_STATE_KEY, type OnboardingState } from '@/types/onboarding'
import ProfilePage from '@/views/ProfilePage.vue'
import ActivityDetails from '@/views/ActivityDetails.vue'
import HomePage from '@/views/HomePage.vue'
import OnboardingFlow from '@/views/onboarding/OnboardingFlow.vue'
import LegalPage from '@/views/LegalPage.vue'
import CGUPage from '@/views/CGUPage.vue'
import Callback from '@/views/Callback.vue'
import GarminOAuthCallback from '@/views/GarminOAuthCallback.vue'
import FriendsPage from '@/views/FriendsPage.vue'
import AddFriendPage from '@/views/AddFriendPage.vue'
import { IndexedDBService } from '@/services/IndexedDBService'

const routes = [
  { path: '/', component: HomePage },
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
  // `/my-activities` was the searchable list, next to a feed on `/` that showed
  // the same cards in the same order for anyone without friends. One list now,
  // on the app root; the old path keeps every link that was shared to it.
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

  // A guard on '/' used to sit here. It read every friend activity out of
  // IndexedDB to decide between `next()` and `next()` — the redirect its
  // comment described had already been removed. It cost a full store read on
  // every navigation home and changed nothing.

  next() // continue normalement
})

export default router
