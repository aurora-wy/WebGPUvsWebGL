export interface FrameSummary {
  fps: number;
  median: number;
  p95: number;
  p99: number;
  over16: number;
  over33: number;
  samples: number;
}

export function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function summarizeFrames(values: readonly number[]): FrameSummary {
  if (values.length === 0) {
    return { fps: 0, median: 0, p95: 0, p99: 0, over16: 0, over33: 0, samples: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    fps: total > 0 ? (values.length * 1000) / total : 0,
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    over16: values.filter((value) => value > 16.7).length / values.length,
    over33: values.filter((value) => value > 33.3).length / values.length,
    samples: values.length,
  };
}

export function averageSummaries(values: readonly FrameSummary[]): FrameSummary {
  if (values.length === 0) return summarizeFrames([]);
  const average = (pick: (value: FrameSummary) => number): number =>
    values.reduce((sum, value) => sum + pick(value), 0) / values.length;
  return {
    fps: average((value) => value.fps),
    median: average((value) => value.median),
    p95: average((value) => value.p95),
    p99: average((value) => value.p99),
    over16: average((value) => value.over16),
    over33: average((value) => value.over33),
    samples: values.reduce((sum, value) => sum + value.samples, 0),
  };
}
