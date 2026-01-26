import type { ExtensionPlugin } from '@/types/extension';

const AggregatedProgressWidget = () => import('@plugins/app-extensions/AggregatedProgress/AggregatedProgressWidget.vue');

const plugin: ExtensionPlugin = {
  id: 'aggregated-progress',
  label: 'Aggregated Progress Widget',
  description: 'Track weekly and monthly progress with distance and activity count summaries',
  icon: 'fas fa-chart-line',
  slots: {
    'myactivities.top': [AggregatedProgressWidget]
  }
};

export default plugin;
