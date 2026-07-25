import type { ExtensionPlugin } from '@/types/extension'

const NavLink = () => import('./components/MetricTrackerNavLink.vue')

const plugin: ExtensionPlugin = {
  id: 'metric-tracker',
  label: 'Metric Tracker',
  description: 'Track how a single metric evolves over time, per outing or per period',
  icon: 'fas fa-chart-line',
  slots: {
    'navigation.main': [NavLink]
  },
  routes: [
    {
      path: '/metrics',
      name: 'MetricTracker',
      component: () => import('./components/MetricTrackerView.vue')
    }
  ]
}

export default plugin
