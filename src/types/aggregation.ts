export type AggregationPeriod = 'week' | 'month' | 'year';
export type AggregationOp = 'sum' | 'avg'; // sprint 1 scope

export interface AggregationMetricDefinition {
  id: string;
  label: string;
  enabled: boolean;
  sourceRef: string; // path in activity/details merged object
  aggregation: AggregationOp;
  periods: AggregationPeriod[];
  unit?: string;
  decimals?: number;
  displayUnit?: string; // unité d'affichage (ex: 'km')
  displayFactor?: number; // facteur de conversion pour l'affichage (ex: 0.001 pour m -> km)
}

export interface AggregatedRecord {
  id: string; // metricId|periodType|periodKey
  metricId: string;
  periodType: AggregationPeriod;
  periodKey: string; // e.g. 2025-W42 / 2025-10 / 2025
  value: number;
  sum: number;
  count: number;
  lastUpdated: number;
}
