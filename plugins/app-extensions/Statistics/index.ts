import type { ExtensionPlugin } from '@/types/extension'

const NavLink = () => import('./components/StatisticsNavLink.vue')

const plugin: ExtensionPlugin = {
  id: 'statistics',
  label: 'Statistics',
  description: 'Global statistics with trends, distribution, personal records and calendar heatmap',
  icon: 'fas fa-chart-bar',
  slots: {
    'navigation.main': [NavLink]
  },
  routes: [
    {
      path: '/statistics',
      name: 'Statistics',
      component: () => import('./components/StatisticsView.vue')
    }
  ]
}

export default plugin
