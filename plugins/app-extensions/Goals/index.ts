import type { ExtensionPlugin } from '@/types/extension'

const GoalsWidget = () => import('./GoalsWidget.vue')

const plugin: ExtensionPlugin = {
  id: 'goals',
  label: 'Training Goals',
  description: 'Set weekly or monthly goals and track your progress in real-time',
  icon: 'fas fa-bullseye',
  slots: {
    // On the feed rather than above the activity list: a goal is the one block
    // of the old overview that asks for an action rather than reporting a
    // figure, and the list is for finding a session again. Everything else
    // that sat there answers "am I progressing", which is the statistics page.
    'home.top': [GoalsWidget]
  }
}

export default plugin
