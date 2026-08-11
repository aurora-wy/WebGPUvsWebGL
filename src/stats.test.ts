import { describe, expect, it } from 'vitest';
import { averageSummaries, percentile, summarizeFrames } from './stats';

describe('percentile', () => {
  it('处理空数组与未排序输入', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([40, 10, 30, 20], 0.5)).toBe(20);
  });

  it('使用 nearest-rank 计算尾部分位数', () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(values, 0.95)).toBe(95);
    expect(percentile(values, 0.99)).toBe(99);
  });
});

describe('summarizeFrames', () => {
  it('计算帧率、分位数与长帧比例', () => {
    const summary = summarizeFrames([10, 16, 20, 40]);
    expect(summary.fps).toBeCloseTo(46.5116, 3);
    expect(summary.median).toBe(16);
    expect(summary.p95).toBe(40);
    expect(summary.p99).toBe(40);
    expect(summary.over16).toBe(0.5);
    expect(summary.over33).toBe(0.25);
    expect(summary.samples).toBe(4);
  });

  it('安全处理空采样', () => {
    expect(summarizeFrames([])).toEqual({
      fps: 0,
      median: 0,
      p95: 0,
      p99: 0,
      over16: 0,
      over33: 0,
      samples: 0,
    });
  });
});

describe('averageSummaries', () => {
  it('聚合交叉轮次并保留总样本量', () => {
    const result = averageSummaries([
      summarizeFrames([10, 10]),
      summarizeFrames([20, 20]),
    ]);
    expect(result.fps).toBe(75);
    expect(result.median).toBe(15);
    expect(result.samples).toBe(4);
  });
});
