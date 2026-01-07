import type { ExtensionPlugin } from '@/types/extension';

const AggregatedProgressWidget = () => import('./AggregatedProgressWidget.vue');

const plugin: ExtensionPlugin = {
  id: 'aggregated-progress',
  label: 'Aggregated Progress Widget',
  slots: {
    'myactivities.top': [AggregatedProgressWidget]
  }
};

export default plugin;
