import { Chess } from './vendor/chess.js';
import { compulsoryDraw, currentDrawClaim } from './match.js';

const values = { p: 100, n: 320, b: 335, r: 500, q: 925, k: 0 };
const expired = Symbol('search time expired');
let deadline;
let nodes;

function evaluate(game) {
  let total = 0;
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const file = piece.square.charCodeAt(0) - 97;
      const rank = Number(piece.square[1]) - 1;
      const progress = piece.color === 'w' ? rank : 7 - rank;
      const center = 7 - Math.abs(file - 3.5) - Math.abs(rank - 3.5);
      let position = 0;
      if (piece.type === 'p') position = progress * 9 + center * 4;
      if (piece.type === 'n') position = center * 13 + (progress > 0 ? 12 : 0);
      if (piece.type === 'b') position = center * 8 + (progress > 0 ? 14 : 0);
      if (piece.type === 'k') position = (file === 6 || file === 2 ? 25 : 0) - progress * 12;
      total += (piece.color === game.turn() ? 1 : -1) * (values[piece.type] + position);
    }
  }
  return total;
}

function priority(move) {
  return (move.promotion ? values[move.promotion] : 0)
    + (move.captured ? 10 * values[move.captured] - values[move.piece] : 0)
    + (move.san.endsWith('+') ? 100 : 0);
}

function search(game, depth, alpha, beta, ply) {
  if ((++nodes & 31) === 0 && performance.now() >= deadline) throw expired;
  const moves = game.moves({ verbose: true });
  const inCheck = game.isCheck();
  if (!moves.length) return inCheck ? -30000 + ply : 0;
  if (compulsoryDraw(game)) return 0;
  const claim = currentDrawClaim(game);
  if (depth === 0) return claim ? Math.max(0, evaluate(game)) : evaluate(game);
  moves.sort((a, b) => priority(b) - priority(a));
  let best = claim ? 0 : -Infinity;
  alpha = Math.max(alpha, best);
  if (alpha >= beta) return best;
  for (const move of moves) {
    game.move(move);
    const score = -search(game, depth - 1, -beta, -alpha, ply + 1);
    game.undo();
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

function choose(history, difficulty) {
  const game = new Chess();
  for (const move of history) game.move(move);
  const moves = game.moves({ verbose: true }).sort((a, b) => priority(b) - priority(a));
  if (!moves.length) return;
  const claim = currentDrawClaim(game);
  let best = moves[0];
  let bestScore = evaluate(game);
  deadline = performance.now() + [0, 180, 460, 850][difficulty];
  nodes = 0;
  try {
    for (let depth = 1; depth <= difficulty + 1; depth++) {
      let highScore = -Infinity;
      let bestAtDepth = best;
      const ordered = [best, ...moves.filter(move => move !== best)];
      for (const move of ordered) {
        game.move(move);
        const score = -search(game, depth - 1, -Infinity, -highScore, 1);
        game.undo();
        if (score > highScore) {
          highScore = score;
          bestAtDepth = move;
        }
      }
      best = bestAtDepth;
      bestScore = highScore;
    }
  } catch (error) {
    if (error !== expired) throw error;
  }
  return claim && bestScore < 0 ? 'claim' : best.lan;
}

self.onmessage = event => {
  const { moves, difficulty } = event.data;
  self.postMessage(choose(moves, difficulty));
};
