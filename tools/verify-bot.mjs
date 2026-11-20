import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess } from '../dist/ability-chess.js';
import { difficulties } from '../dist/difficulty.js';

globalThis.self = {};
const { searchBestMove } = await import('../dist/bot.js');

test('every level finds checkmate using inherited movement', () => {
  for (const level of difficulties) {
    const game = new Chess('7k/8/5K2/6N1/8/8/8/8 w - - 0 1');
    game._set(54, { type: 'n', color: 'w', abilities: ['b', 'r'] });
    game._positionCount = new Map([[game._hash, 1]]);
    const before = game.positionKey();
    const result = searchBestMove(game, level.id);
    assert.equal(game.positionKey(), before);
    game.move(result.move);
    assert.equal(game.isCheckmate(), true, level.name);
  }
});

test('Impossible exits on deadline with a legal move and restores all game state', () => {
  const game = new Chess();
  for (const move of 'e4 d5 exd5 Qxd5 Nc3 Qe6+ Be2 Qxe2+ Ngxe2'.split(' ')) game.move(move);
  const before = { board: game.board(), hash: game.positionKey(), fen: game.fen(), counts: game.repetitionCounts(), history: game.history() };
  let ticks = 0;
  const result = searchBestMove(game, 5, { now: () => (ticks++) * 100 });
  assert.ok(game.moves({ verbose: true }).some(move => move.lan === result.move));
  assert.ok(ticks >= 60);
  assert.deepEqual({ board: game.board(), hash: game.positionKey(), fen: game.fen(), counts: game.repetitionCounts(), history: game.history() }, before);
});

test('a longer search completes deeper iterations with deterministic time', () => {
  const game = new Chess();
  const easy = searchBestMove(game, 1, { now: () => 0 });
  let ticks = 0;
  const impossible = searchBestMove(game, 5, { now: () => ticks++ });
  assert.equal(easy.depth, 1);
  assert.ok(impossible.depth > easy.depth);
  assert.ok(impossible.nodes > easy.nodes);
});

test('the worker handles Impossible and invalid settings with legal responses', () => {
  const response = [];
  self.postMessage = move => response.push(move);
  for (const difficulty of [5, undefined, 999]) self.onmessage({ data: { moves: ['f3', 'e5', 'g4'], difficulty } });
  assert.deepEqual(response, ['d8h4', 'd8h4', 'd8h4']);
});
