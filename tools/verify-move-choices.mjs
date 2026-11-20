import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess } from '../dist/ability-chess.js';
import { legalMoveChoices } from '../dist/move-choices.js';

function verify(game, square) {
  const expected = game.moves({ square, verbose: true }).map(move => move.lan).sort();
  const san = game._moveToSan;
  game._moveToSan = () => { throw new Error('legal UI choices must not build SAN'); };
  let choices;
  try { choices = legalMoveChoices(game, square); }
  finally { game._moveToSan = san; }
  assert.deepEqual(choices.map(move => move.lan).sort(), expected);
  return choices;
}

test('fast UI choices match legal moves, including inherited movement', () => {
  const game = new Chess();
  verify(game);
  verify(game, 'e2');
  for (const move of 'e4 d5 exd5 Qxd5 Nc3 Qe6+ Be2 Qxe2+ Ngxe2 Nf6'.split(' ')) game.move(move);
  const choices = verify(game, 'e2');
  assert.ok(choices.some(move => move.to === 'e6'));
});

test('fast UI choices retain promotion, en passant captures, and castling', () => {
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(verify(promotion, 'a7').length, 4);
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(verify(castle, 'e1').some(move => move.lan === 'e1g1'));
  const game = new Chess();
  for (const move of ['e4', 'a6', 'e5', 'd5']) game.move(move);
  assert.equal(verify(game, 'e5').find(move => move.to === 'd6').captured, 'p');
});
