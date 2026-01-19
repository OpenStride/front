import { createRouter, createWebHistory } from 'vue-router';
import ProfilePage from "@/views/ProfilePage.vue";
import MyActivities from '@/views/MyActivities.vue';
import ActivityDetails from '@/views/ActivityDetails.vue';
import HomePage from '@/views/HomePage.vue';
import OnboardingFlow from '@/views/onboarding/OnboardingFlow.vue';
import LegalPage from '@/views/LegalPage.vue';
import CGUPage from '@/views/CGUPage.vue';
import Callback from '@/views/Callback.vue';
import { getActivityDBService } from '@/services/ActivityDBService';

const routes = [
  { path: '/', component: HomePage },
  { path: '/onboarding', component: OnboardingFlow },
  { path: '/legal', component: LegalPage },
  { path: '/cgu', component: CGUPage },
  { path: '/callback', component: Callback },
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
  { path: "/profile", component: ProfilePage },
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
  { path: '/storage-providers', redirect: '/profile?tab=cloud-backup' }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  // Empêcher accès à /onboarding si déjà complété
  if (to.path === '/onboarding') {
    const { IndexedDBService } = await import('@/services/IndexedDBService');
    const db = await IndexedDBService.getInstance();
    const state = await db.getData('onboarding_state');
    if (state?.completed) {
      return next('/my-activities');
    }
  }

  // Rediriger home vers activities si l'utilisateur a des données
  if (to.path === '/') {
    const db = await getActivityDBService();
    const activities = await db.getActivities({ limit: 1, offset: 0 });

    if (activities.length > 0) {
      return next('/my-activities');
    }
  }

  next(); // continue normalement
});

export default router;