export const difficulties = [
  { id: 1, name: 'Easy', depth: 1, timeMs: 120, quiescence: 0, description: 'A quick opponent that looks one move ahead.' },
  { id: 2, name: 'Medium', depth: 3, timeMs: 400, quiescence: 2, description: 'Looks ahead and checks short capture sequences.' },
  { id: 3, name: 'Hard', depth: 5, timeMs: 1000, quiescence: 4, description: 'Deeper search with stronger tactical awareness.' },
  { id: 4, name: 'Expert', depth: 8, timeMs: 2500, quiescence: 6, description: 'A demanding opponent. Thinks for up to 2.5 seconds.' },
  { id: 5, name: 'Impossible', depth: 14, timeMs: 6000, quiescence: 10, description: 'The strongest AI. Thinks for up to 6 seconds per move.' },
];

export const difficultyFor = id => difficulties.find(level => level.id === id) ?? difficulties[1];
