import type { ExtensionPlugin } from '@/types/extension'

const plugin: ExtensionPlugin = {
  id: 'metric-tracker',
  label: 'Metric Tracker',
  description: 'Track how a single metric evolves over time, per outing or per period',
  icon: 'fas fa-chart-line',
  slots: {
    // Lives inside the statistics page rather than behind its own nav entry:
    // it answers the same question as the rest of that page. The route below
    // stays, so a direct link — such as the one on each session best — still
    // opens it on its own.
    'statistics.sections': [() => import('./components/MetricTrackerSection.vue')]
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
