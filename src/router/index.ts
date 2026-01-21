import { createRouter, createWebHistory } from 'vue-router';
import ProfilePage from "@/views/ProfilePage.vue";
import MyActivities from '@/views/MyActivities.vue';
import ActivityDetails from '@/views/ActivityDetails.vue';
import DataProviders from '@/views/DataProviders.vue';
import StorageProviders from '@/views/StorageProviders.vue';
import AppExtensions from '@/views/AppExtensions.vue';
import HomePage from '@/views/HomePage.vue';
import OnboardingFlow from '@/views/onboarding/OnboardingFlow.vue';
import LegalPage from '@/views/LegalPage.vue';
import CGUPage from '@/views/CGUPage.vue';
import Callback from '@/views/Callback.vue';
import { getActivityDBService } from '@/services/ActivityDBService';

const routes = [
  { path: '/', component: HomePage },
  { path: '/onboarding', component: OnboardingFlow },
  { path: '/data-providers', component: DataProviders },
  { path: '/legal', component: LegalPage },
  { path: '/cgu', component: CGUPage },
  { path: '/callback', component: Callback },
  { path: '/storage-providers', component: StorageProviders },
  { path: '/app-extensions', component: AppExtensions },
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
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
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