export const pointsForDrop = (distance, kind) => Math.max(0, distance) * (kind === 'hard' ? 2 : 1);

export function scoreClear({ cleared, level, combo = -1, backToBack = false }) {
  const base = [0, 100, 300, 500, 800][cleared] || 0;
  const isTetris = cleared === 4;
  const comboBonus = cleared ? Math.max(0, combo) * 50 : 0;
  const difficultBonus = isTetris && backToBack ? Math.floor(base * 0.5) : 0;
  return {
    points: (base + comboBonus + difficultBonus) * Math.max(1, level),
    combo: cleared ? combo + 1 : -1,
    backToBack: isTetris || (cleared > 0 && backToBack)
  };
}

export const levelForLines = lines => Math.floor(Math.max(0, lines) / 10) + 1;
