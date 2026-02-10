import { createRouter, createWebHistory } from 'vue-router'
import ProfilePage from '@/views/ProfilePage.vue'
import MyActivities from '@/views/MyActivities.vue'
import ActivityDetails from '@/views/ActivityDetails.vue'
import HomePage from '@/views/HomePage.vue'
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
  { path: '/my-activities', component: MyActivities },
  {
    path: '/history/:parameter?',
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
    const state = await db.getData('onboarding_state')
    if (state?.completed) {
      return next('/my-activities')
    }
  }

  // Rediriger home vers activities si l'utilisateur a des données
  if (to.path === '/') {
    // Check own activities
    const activityService = await getActivityService()
    const ownActivities = await activityService.getActivities({ limit: 1, offset: 0 })

    // Check friend activities
    const db = await IndexedDBService.getInstance()
    const friendActivities = await db.getAllData('friend_activities')

    // If user has ANY activities (own or friends), stay on HomePage
    // HomePage will show the mixed feed via ActivityFeedService
    if (ownActivities.length > 0 || friendActivities.length > 0) {
      // Don't redirect, let HomePage show the activity feed
      return next()
    }
  }

  next() // continue normalement
})

export default router
