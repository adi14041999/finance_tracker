import { describe, it, expect } from 'vitest';
import {
  linearScale, bandCentres, bandWidth, niceDomain,
  linePath, areaPath, arcPath, nearestIndex, labelStride,
} from './chart';

describe('linearScale', () => {
  it('maps a domain onto a range', () => {
    const s = linearScale([0, 100], [0, 200]);
    expect(s(0)).toBe(0);
    expect(s(50)).toBe(100);
    expect(s(100)).toBe(200);
  });

  it('inverts for SVG, where y grows downward', () => {
    const s = linearScale([0, 100], [300, 0]);
    expect(s(0)).toBe(300);
    expect(s(100)).toBe(0);
  });

  it('centres a flat series instead of dividing by zero', () => {
    const s = linearScale([50, 50], [0, 200]);
    expect(s(50)).toBe(100);
  });
});

describe('bands', () => {
  it('spaces centres evenly with half-step margins', () => {
    expect(bandCentres(4, [0, 400])).toEqual([50, 150, 250, 350]);
  });

  it('centres a single band', () => {
    expect(bandCentres(1, [0, 400])).toEqual([200]);
  });

  it('handles zero bands', () => {
    expect(bandCentres(0, [0, 400])).toEqual([]);
  });

  it('computes width with an inset gap', () => {
    // The 2px surface gap between adjacent bars.
    expect(bandWidth(4, [0, 400], 2)).toBe(98);
  });

  it('never returns a width below 1px', () => {
    expect(bandWidth(400, [0, 100], 2)).toBe(1);
  });
});

describe('niceDomain', () => {
  it('rounds bounds outward to round numbers', () => {
    const { domain } = niceDomain([0, 3172, 4810]);
    expect(domain[0]).toBe(0);
    expect(domain[1]).toBeGreaterThan(4810);
    expect(domain[1] % 1000).toBe(0);
  });

  it('always includes zero, so the axis cannot exaggerate', () => {
    // Truncating to 9000..10000 would turn a 10% rise into a full-height climb.
    const { domain } = niceDomain([9200, 9600, 10000]);
    expect(domain[0]).toBe(0);
  });

  it('can opt out of including zero', () => {
    const { domain } = niceDomain([9200, 10000], { includeZero: false });
    expect(domain[0]).toBeGreaterThan(0);
  });

  it('extends below zero when values are negative', () => {
    const { domain } = niceDomain([-4200, 8000]);
    expect(domain[0]).toBeLessThan(-4200);
    expect(domain[1]).toBeGreaterThan(8000);
  });

  it('emits ticks free of floating point noise', () => {
    const { ticks } = niceDomain([0, 1]);
    for (const t of ticks) {
      expect(String(t).length).toBeLessThan(8); // no 0.30000000000000004
    }
  });

  it('produces ticks spanning exactly the domain', () => {
    const { domain, ticks } = niceDomain([0, 4810]);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
  });

  it('frames an all-zero series without collapsing', () => {
    const { domain, ticks } = niceDomain([0, 0, 0]);
    expect(domain).toEqual([0, 1]);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('survives an empty series', () => {
    expect(niceDomain([]).domain).toEqual([0, 1]);
  });
});

describe('paths', () => {
  it('draws straight segments between points', () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 10, y: 0 }])).toBe('M 0 10 L 10 0');
  });

  it('gives a lone point a visible tick', () => {
    expect(linePath([{ x: 50, y: 20 }])).toBe('M 47 20 L 53 20');
  });

  it('returns empty for no points instead of a broken path', () => {
    expect(linePath([])).toBe('');
  });

  it('closes an area down to the baseline', () => {
    const d = areaPath([{ x: 0, y: 10 }, { x: 10, y: 0 }], 100);
    expect(d).toBe('M 0 10 L 10 0 L 10 100 L 0 100 Z');
  });

  it('rounds coordinates so the markup stays small', () => {
    expect(linePath([{ x: 1.23456, y: 2 }, { x: 3, y: 4 }])).toBe('M 1.23 2 L 3 4');
  });
});

describe('arcPath', () => {
  it('starts a zero-angle arc at 12 o’clock', () => {
    const d = arcPath(100, 100, 50, 30, 0, Math.PI / 2);
    expect(d.startsWith('M 100 50')).toBe(true);
  });

  it('sets the large-arc flag past a half turn', () => {
    const small = arcPath(100, 100, 50, 30, 0, Math.PI / 2);
    const large = arcPath(100, 100, 50, 30, 0, Math.PI * 1.5);
    expect(small).toContain('0 1');
    expect(large).toContain('1 1');
  });

  it('splits a full circle in two, which one arc cannot draw', () => {
    const d = arcPath(100, 100, 50, 30, 0, Math.PI * 2);
    // Two subpaths, so the ring actually renders.
    expect(d.split('M').length - 1).toBe(2);
  });
});

describe('nearestIndex', () => {
  it('finds the closest x for the crosshair', () => {
    expect(nearestIndex([0, 50, 100], 60)).toBe(1);
    expect(nearestIndex([0, 50, 100], 80)).toBe(2);
  });

  it('clamps beyond either end', () => {
    expect(nearestIndex([0, 50, 100], -20)).toBe(0);
    expect(nearestIndex([0, 50, 100], 500)).toBe(2);
  });

  it('returns -1 with nothing to point at', () => {
    expect(nearestIndex([], 10)).toBe(-1);
  });
});

describe('labelStride', () => {
  it('shows every label when they fit', () => {
    expect(labelStride(6, 600)).toBe(1);
  });

  it('thins them out when they would collide', () => {
    expect(labelStride(24, 300)).toBeGreaterThan(1);
  });

  it('never returns zero, which would hide every label', () => {
    expect(labelStride(100, 10)).toBeGreaterThan(0);
  });
});
