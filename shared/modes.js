export const GAME_MODES = Object.freeze({
  classic: { id: 'classic', label: 'Classic', description: 'Steady gravity and standard penalties.' },
  gravity: { id: 'gravity', label: 'Gravity+', description: 'Gravity speeds up every ten cleared lines.' },
  ghost: { id: 'ghost', label: 'Ghost', description: 'Locked blocks fade after five seconds.' },
  hotSauce: { id: 'hotSauce', label: 'Hot Sauce', description: 'Attacks send twice as many garbage rows.' }
});

export const isGameMode = mode => Object.hasOwn(GAME_MODES, mode);
