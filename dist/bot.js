import { Chess, movementAbilities } from './ability-chess.js';
import { difficultyFor } from './difficulty.js';

const values = { p: 100, n: 320, b: 335, r: 500, q: 925, k: 0 };
const MATE = 30000;
const expired = Symbol('search time expired');
const coordinate = square => 'abcdefgh'[square & 7] + '87654321'[square >> 4];
const moveKey = move => move ? move.from + ':' + move.to + ':' + (move.promotion ?? '') : '';
const lan = move => coordinate(move.from) + coordinate(move.to) + (move.promotion ?? '');

function material(piece) {
  if (piece.type === 'k') return 0;
  const abilities = movementAbilities(piece);
  let value = abilities.reduce((sum, type) => sum + values[type], 0);
  if (abilities.includes('b') && abilities.includes('r')) value += 90;
  // Pawn identity still carries promotion potential, even with other movement.
  return Math.max(values[piece.type], value);
}

function evaluate(game) {
  let total = 0;
  for (let square = 0; square < 128; square++) {
    if (square & 0x88) { square += 7; continue; }
    const piece = game._board[square];
    if (!piece) continue;
    const file = square & 7;
    const rank = 7 - (square >> 4);
    const progress = piece.color === 'w' ? rank : 7 - rank;
    const center = 7 - Math.abs(file - 3.5) - Math.abs(rank - 3.5);
    const abilities = movementAbilities(piece);
    let position = center * 3;
    if (piece.type === 'p') position += progress * 9;
    if (abilities.includes('n')) position += center * 13;
    if (abilities.includes('b')) position += center * 8;
    if (piece.type === 'k') position = (file === 6 || file === 2 ? 25 : 0) - progress * 12;
    total += (piece.color === game.turn() ? 1 : -1) * (material(piece) + position);
  }
  return total;
}

// Use the engine's internal moves during search, avoiding SAN generation and
// full board history reconstruction at every node. Keep repetition counts exact.
function make(game, move) {
  game._makeMove(move);
  game._incPositionCount();
}
function undo(game) {
  game._decPositionCount(game._hash);
  game._undoMove();
}
function claimable(game) {
  return game._halfMoves >= 100 || game.isThreefoldRepetition();
}
function drawn(game) {
  return game._halfMoves >= 150 || game.isInsufficientMaterial() || game._getPositionCount(game._hash) >= 5;
}

export function searchBestMove(game, difficulty, { now = () => performance.now() } = {}) {
  const level = difficultyFor(difficulty);
  const deadline = now() + level.timeMs;
  const preferred = new Map();
  const killers = new Map();
  let nodes = 0;
  const visit = () => {
    nodes++;
    if (now() >= deadline) throw expired;
  };
  const priority = (move, preferredKey, ply) => {
    const key = moveKey(move);
    if (key === preferredKey) return 1000000;
    const captured = move.flags & 8
      ? game._board[move.to + (move.color === 'w' ? 16 : -16)] : game._board[move.to];
    return (move.promotion ? 20000 + values[move.promotion] : 0)
      + (captured ? 10000 + 10 * material(captured) - material(game._board[move.from]) : 0)
      + (killers.get(ply) === key ? 9000 : 0);
  };
  const ordered = (moves, ply, key) => moves.map(move => ({ move, score: priority(move, key, ply) }))
    .sort((a, b) => b.score - a.score).map(entry => entry.move);

  function quiescence(alpha, beta, ply, remaining) {
    visit();
    const moves = game._moves();
    const check = game.isCheck();
    if (!moves.length) return check ? -MATE + ply : 0;
    if (drawn(game)) return 0;
    const claim = claimable(game);
    const stand = claim ? Math.max(0, evaluate(game)) : evaluate(game);
    // In check, search all evasions instead of pretending a player can pass.
    if (remaining <= 0) return stand;
    if (!check) {
      if (stand >= beta) return stand;
      alpha = Math.max(alpha, stand);
    } else if (claim) {
      alpha = Math.max(alpha, 0);
      if (alpha >= beta) return alpha;
    }
    const tactical = check ? moves : moves.filter(move => move.captured || move.promotion);
    for (const move of ordered(tactical, ply)) {
      make(game, move);
      let score;
      try { score = -quiescence(-beta, -alpha, ply + 1, remaining - 1); }
      finally { undo(game); }
      if (score >= beta) return score;
      alpha = Math.max(alpha, score);
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply) {
    if (depth <= 0) return quiescence(alpha, beta, ply, level.quiescence);
    visit();
    const moves = game._moves();
    if (!moves.length) return game.isCheck() ? -MATE + ply : 0;
    if (drawn(game)) return 0;
    let best = claimable(game) ? 0 : -Infinity;
    alpha = Math.max(alpha, best);
    if (alpha >= beta) return best;
    const key = game.positionKey();
    let bestMove;
    for (const move of ordered(moves, ply, preferred.get(key))) {
      make(game, move);
      let score;
      try { score = -search(depth - 1, -beta, -alpha, ply + 1); }
      finally { undo(game); }
      if (score > best) { best = score; bestMove = move; }
      alpha = Math.max(alpha, score);
      if (alpha >= beta) {
        if (!move.captured && !move.promotion) killers.set(ply, moveKey(move));
        break;
      }
    }
    // Cache ordering only: draw eligibility also depends on prior positions.
    if (preferred.size < 50000) preferred.set(key, moveKey(bestMove));
    return best;
  }

  const moves = ordered(game._moves(), 0);
  if (!moves.length) return { move: undefined, depth: 0, nodes, score: game.isCheck() ? -MATE : 0 };
  const claim = claimable(game);
  let best = moves[0];
  let bestScore = -Infinity;
  let completedDepth = 0;
  try {
    for (let depth = 1; depth <= level.depth; depth++) {
      let highScore = -Infinity;
      let bestAtDepth = best;
      for (const move of ordered(moves, 0, moveKey(best))) {
        visit();
        make(game, move);
        let score;
        try { score = -search(depth - 1, -Infinity, -highScore, 1); }
        finally { undo(game); }
        if (score > highScore) { highScore = score; bestAtDepth = move; }
      }
      // Commit only complete iterations so a timeout cannot select a half-tested move.
      best = bestAtDepth;
      bestScore = highScore;
      completedDepth = depth;
      if (bestScore >= MATE - 100 || moves.length === 1) break;
    }
  } catch (error) {
    if (error !== expired) throw error;
  }
  return { move: claim && bestScore < 0 ? 'claim' : lan(best), depth: completedDepth, nodes, score: bestScore };
}

self.onmessage = event => {
  const { moves, difficulty } = event.data;
  const game = new Chess();
  for (const move of moves) game.move(move);
  self.postMessage(searchBestMove(game, difficulty).move);
};
