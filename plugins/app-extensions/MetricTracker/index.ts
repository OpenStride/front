import type { ExtensionPlugin } from '@/types/extension'

const plugin: ExtensionPlugin = {
  id: 'metric-tracker',
  label: 'Metric Tracker',
  description: 'Track how a single metric evolves over time, per outing or per period',
  icon: 'fas fa-chart-line',
  // No slot and no nav entry: the dashboard answers "am I getting faster?"
  // with its own progress block, which links here already set to the sport
  // and the metric. A session best links here too.
  routes: [
    {
      path: '/metrics',
      name: 'MetricTracker',
      component: () => import('./components/MetricTrackerView.vue')
    }
  ]
}

export default plugin
