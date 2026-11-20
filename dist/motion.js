export const CHECKMATE_PAUSE_MS = 3000;

export function motionPaths(move) {
  const paths = [{ from: move.from, to: move.to }];
  const rank = move.from[1];
  if (move.flags.includes('k')) paths.push({ from: 'h' + rank, to: 'f' + rank });
  if (move.flags.includes('q')) paths.push({ from: 'a' + rank, to: 'd' + rank });
  return paths;
}

export function capturedSquare(move) {
  if (!move.captured) return null;
  return move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
}

export function createMoveAnimator(squares, reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const active = new Set();
  function snapshot() {
    return new Map([...squares].map(([square, button]) => [square, {
      piece: button.querySelector('.piece'),
      rect: button.getBoundingClientRect(),
    }]));
  }
  function cancel() {
    for (const animation of active) animation.cancel();
  }
  function place(move, before) {
    // Relocate the actual elements before rendering. No image clones, hidden
    // replacements, or full-board rebuilds are needed for an animated move.
    before.get(capturedSquare(move))?.piece?.remove();
    for (const { from, to } of motionPaths(move)) {
      const piece = before.get(from)?.piece;
      if (piece) squares.get(to).append(piece);
    }
  }
  async function play(move, before) {
    if (reducedMotion()) return;
    const cleanup = [];
    const pending = [];
    const started = [];
    function animate(element, frames, options) {
      if (!element.animate) return;
      const animation = element.animate(frames, options);
      active.add(animation);
      started.push(animation);
      pending.push(animation.finished.catch(() => {}).finally(() => active.delete(animation)));
    }
    try {
      const capture = capturedSquare(move);
      const victim = before.get(capture)?.piece;
      if (victim) {
        squares.get(capture).append(victim);
        victim.classList.add('motion-victim');
        cleanup.push(() => victim.remove());
        animate(victim, [{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
      }
      for (const { from, to } of motionPaths(move)) {
        const source = before.get(from);
        const target = squares.get(to);
        const visual = source?.piece;
        if (!visual || visual.parentNode !== target) continue;
        const rect = target.getBoundingClientRect();
        visual.classList.add('motion-piece');
        target.classList.add('moving');
        cleanup.push(() => {
          visual.classList.remove('motion-piece');
          target.classList.remove('moving');
        });
        animate(visual, [
          { transform: `translate(${source.rect.left - rect.left}px, ${source.rect.top - rect.top}px)` },
          { transform: 'translate(0, 0)' },
        ], { duration: 340, easing: 'cubic-bezier(.25,.65,.3,1)', fill: 'both' });
      }
      await Promise.all(pending);
    } finally {
      for (const finish of cleanup) finish();
      // Keep a faded capture invisible until the sliding piece also finishes.
      for (const animation of started) animation.cancel();
    }
  }
  return { snapshot, place, play, cancel };
}

// One cancellable results transition; leaving the board or choosing to keep
// reviewing invalidates it, so an old timer cannot interrupt a new game.
export function createResultsPause({ schedule = setTimeout, clear = clearTimeout } = {}) {
  let timer;
  let generation = 0;
  function cancel() {
    generation++;
    if (timer !== undefined) clear(timer);
    timer = undefined;
  }
  function start(callback) {
    cancel();
    const current = generation;
    timer = schedule(() => {
      if (current !== generation) return;
      timer = undefined;
      callback();
    }, CHECKMATE_PAUSE_MS);
  }
  return { start, cancel };
}
