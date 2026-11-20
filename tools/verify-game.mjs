import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess } from '../dist/vendor/chess.js';
import { openings } from '../dist/openings.js';
import { automaticEnding, drawClaims, replayOpening, resignation } from '../dist/match.js';

const play = (game, notation) => notation.split(' ').forEach(move => game.move(move, { strict: true }));
const loop = 'Nf3 Nf6 Ng1 Ng8';
let botResponse;
const worker = { postMessage(move) { botResponse = move; } };
globalThis.self = worker;
await import('../dist/bot.js');

function askBot(moves, difficulty) {
  botResponse = undefined;
  worker.onmessage({ data: { moves, difficulty } });
  return botResponse;
}

test('all 120 openings replay legally, have equal material, and are distinct', () => {
  const positions = new Set();
  for (const opening of openings) {
    const game = replayOpening(opening);
    const history = game.history({ verbose: true });
    assert.ok(history.length >= 8 && history.length <= 12);
    assert.ok(history.every(move => !move.captured));
    assert.ok(Math.abs(opening.evaluation) <= 30);
    assert.equal(automaticEnding(game), null);
    assert.equal(game.isCheck(), false);
    positions.add(game.fen().split(' ', 4).join(' '));
  }
  assert.equal(positions.size, 120);
});

test('threefold repetition can be claimed before or after the third occurrence', () => {
  const game = new Chess();
  play(game, loop + ' Nf3 Nf6 Ng1');
  assert.equal(drawClaims(game).current, null);
  assert.deepEqual(drawClaims(game).byMove.map(({ move }) => move.san), ['Ng8']);
  play(game, 'Ng8');
  assert.equal(drawClaims(game).current, 'Threefold repetition');
  assert.equal(automaticEnding(game), null);
  play(game, loop);
  assert.equal(automaticEnding(game), null);
  play(game, loop);
  assert.deepEqual(automaticEnding(game), { winner: null, reason: 'Fivefold repetition' });
});

test('a claim at 50 moves stays optional, and checkmate takes precedence at 75', () => {
  const position = '7k/8/8/8/8/8/2R5/K7 w - - ';
  const early = new Chess(position + '99 55');
  assert.ok(drawClaims(early).byMove.some(({ reason }) => reason === 'Fifty-move rule'));
  const claimable = new Chess(position + '100 55');
  assert.equal(drawClaims(claimable).current, 'Fifty-move rule');
  assert.equal(automaticEnding(claimable), null);
  const automatic = new Chess(position + '150 80');
  assert.equal(automaticEnding(automatic).reason, 'Seventy-five-move rule');
  const mate = new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 150 80');
  assert.deepEqual(automaticEnding(mate), { winner: 'w', reason: 'Checkmate' });
  const stalemate = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 150 80');
  assert.equal(automaticEnding(stalemate).reason, 'Stalemate');
});

test('castling moves both pieces and is unavailable through check', () => {
  const game = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(game.moves().includes('O-O'));
  assert.ok(game.moves().includes('O-O-O'));
  play(game, 'O-O');
  assert.equal(game.get('f1').type, 'r');
  assert.equal(game.get('g1').type, 'k');
  const attacked = new Chess('k4r2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!attacked.moves().includes('O-O'));
});

test('an en passant capture expires, and a pawn can promote to any of four pieces', () => {
  const game = new Chess();
  play(game, 'e4 a6 e5 d5');
  assert.ok(game.moves({ verbose: true }).some(move => move.isEnPassant()));
  play(game, 'exd6');
  assert.equal(game.get('d5'), undefined);
  game.undo();
  play(game, 'Nf3 a5');
  assert.ok(!game.moves({ verbose: true }).some(move => move.isEnPassant()));
  const promotion = new Chess('7k/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(promotion.moves({ square: 'a7' }).length, 4);
  play(promotion, 'a8=N');
  assert.equal(promotion.get('a8').type, 'n');
  assert.equal(automaticEnding(promotion).reason, 'Insufficient material');
});

test('resignation against a bare king is a draw', () => {
  const game = new Chess('7k/8/8/8/8/8/2R5/K7 w - - 0 1');
  assert.equal(resignation(game, 'w').winner, null);
  assert.equal(resignation(game, 'b').winner, 'w');
});

test('all five bot difficulties find a mate in one', () => {
  for (const difficulty of [1, 2, 3, 4, 5]) {
    assert.equal(askBot(['f3', 'e5', 'g4'], difficulty), 'd8h4');
  }
});

test('the bot can claim a repetition in a losing position', () => {
  const moves = 'e4 d5 exd5 Qxd5 Nc3 Qe6+ Be2 Qxe2+ Qxe2 Nf6 Nf3 Ng8 Ng1 Nf6 Nf3 Ng8 Ng1'.split(' ');
  assert.equal(askBot(moves, 2), 'claim');
});
