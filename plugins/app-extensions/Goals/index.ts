import type { ExtensionPlugin } from '@/types/extension'

const GoalsWidget = () => import('./GoalsWidget.vue')

const plugin: ExtensionPlugin = {
  id: 'goals',
  label: 'Training Goals',
  description: 'Set weekly or monthly goals and track your progress in real-time',
  icon: 'fas fa-bullseye',
  slots: {
    'myactivities.top': [GoalsWidget]
  }
}

export default plugin
