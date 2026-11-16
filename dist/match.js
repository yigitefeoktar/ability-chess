import { Chess } from './vendor/chess.js';

export const opposite = color => color === 'w' ? 'b' : 'w';
const positionKey = fen => fen.split(' ', 4).join(' ');
const halfmoves = fen => Number(fen.split(' ')[4]);
const draw = reason => ({ winner: null, reason });

export function positionCounts(game) {
  const history = game.history({ verbose: true });
  const counts = new Map();
  const positions = history.length ? [history[0].before, ...history.map(move => move.after)] : [game.fen()];
  for (const fen of positions) {
    const key = positionKey(fen);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function compulsoryDraw(game) {
  if (game.isInsufficientMaterial()) return 'Insufficient material';
  if (game.isDrawByFiftyMoves() && halfmoves(game.fen()) >= 150) return 'Seventy-five-move rule';
  if (game.isThreefoldRepetition() && positionCounts(game).get(positionKey(game.fen())) >= 5) {
    return 'Fivefold repetition';
  }
  return null;
}

export function automaticEnding(game) {
  if (game.isCheckmate()) return { winner: opposite(game.turn()), reason: 'Checkmate' };
  if (game.isStalemate()) return draw('Stalemate');
  const reason = compulsoryDraw(game);
  return reason ? draw(reason) : null;
}

export function currentDrawClaim(game) {
  if (game.isThreefoldRepetition()) return 'Threefold repetition';
  if (game.isDrawByFiftyMoves()) return 'Fifty-move rule';
  return null;
}

export function drawClaims(game) {
  const current = currentDrawClaim(game);
  if (current) return { current, byMove: [] };
  const clock = halfmoves(game.fen());
  if (clock < 7) return { current: null, byMove: [] };
  const counts = positionCounts(game);
  if (clock < 99 && ![...counts.values()].some(count => count >= 2)) {
    return { current: null, byMove: [] };
  }
  const byMove = [];
  for (const move of game.moves({ verbose: true })) {
    if ((counts.get(positionKey(move.after)) ?? 0) >= 2) byMove.push({ move, reason: 'Threefold repetition' });
    else if (halfmoves(move.after) >= 100) byMove.push({ move, reason: 'Fifty-move rule' });
  }
  return { current: null, byMove };
}

export function resignation(game, color) {
  const winner = opposite(color);
  const canMate = game.board().some(row => row.some(piece => piece?.color === winner && piece.type !== 'k'));
  return canMate ? { winner, reason: 'Resignation' } : draw('Resignation · No mating material');
}

export function replayOpening(opening, moves = []) {
  const game = new Chess();
  for (const move of [...opening.moves.split(' '), ...moves]) game.move(move, { strict: true });
  return game;
}

export function restoreMatch(storage, openings) {
  const data = JSON.parse(storage.getItem('opening-shuffle-match-v1'));
  if (!data || !['bot', 'local'].includes(data.mode)
      || ![1, 2, 3].includes(data.difficulty) || ![1, 2].includes(data.round)
      || !['w', 'b'].includes(data.firstColor) || !['w', 'b'].includes(data.orientation)
      || !Array.isArray(data.moves) || !Array.isArray(data.scores) || data.scores.length !== 2
      || !data.scores.every(score => [0, .5, 1, 1.5, 2].includes(score))) return null;
  const opening = openings.find(candidate => candidate.moves === data.opening);
  if (!opening) return null;
  const game = replayOpening(opening, data.moves);
  const ending = automaticEnding(game) ?? data.ending;
  if (ending && (![null, 'w', 'b'].includes(ending.winner) || typeof ending.reason !== 'string')) return null;
  return { ...data, opening, game, ending };
}

export function saveMatch(storage, match) {
  const { opening, game, mode, difficulty, round, firstColor, orientation, scores, ending, screen } = match;
  const moves = game.history().slice(opening.moves.split(' ').length);
  storage.setItem('opening-shuffle-match-v1', JSON.stringify({
    opening: opening.moves, moves, mode, difficulty, round, firstColor, orientation, scores, ending, screen
  }));
}
