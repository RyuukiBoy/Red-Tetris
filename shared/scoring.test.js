import { describe, expect, it } from 'vitest';
import { levelForLines, pointsForDrop, scoreClear } from './scoring.js';

describe('bonus scoring rules', () => {
  it('scores guideline line clears, combos, and back-to-back tetrises', () => {
    expect(scoreClear({ cleared: 1, level: 1 })).toMatchObject({ points: 100, combo: 0 });
    expect(scoreClear({ cleared: 2, level: 2, combo: 1 }).points).toBe(700);
    expect(scoreClear({ cleared: 4, level: 3, combo: 0, backToBack: true }).points).toBe(3600);
  });
  it('awards drop points and advances a level every ten lines', () => {
    expect(pointsForDrop(4, 'soft')).toBe(4);
    expect(pointsForDrop(4, 'hard')).toBe(8);
    expect(levelForLines(20)).toBe(3);
  });
});
