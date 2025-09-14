import { describe, it, expect } from 'vitest';
import { roundToScale } from '../src/util';

describe('roundToScale floor precision (no Number issues)', () => {
  const SCALE = 10n ** 18n;

  it('0.01 × 1e18 → 1e16 (floor)', () => {
    const r = roundToScale('0.01', SCALE);
    expect(r).toEqual(10n ** 16n);
  });

  it('1 × 1e18 → 1e18 (floor)', () => {
    const r = roundToScale('1', SCALE);
    expect(r).toEqual(10n ** 18n);
  });

  it('1234.567 × 1e18 → 1234567000000000000000 (floor)', () => {
    const r = roundToScale('1234.567', SCALE);
    expect(r).toEqual(1234567000000000000000n);
  });

  it('accepts number input safely (converted to string)', () => {
    const r1 = roundToScale(0.01, SCALE);
    const r2 = roundToScale('0.01', SCALE);
    expect(r1).toEqual(r2);
  });
});

