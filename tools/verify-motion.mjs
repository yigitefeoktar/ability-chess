import assert from 'node:assert/strict';
import { test } from 'node:test';
import { motionPaths, capturedSquare } from '../dist/motion.js';
import { Chess } from '../dist/ability-chess.js';

test('castling animates both pieces for either color and either side', () => {
  for (const rank of ['1', '8']) {
    assert.deepEqual(motionPaths({ from: 'e' + rank, to: 'g' + rank, flags: 'k' }), [
      { from: 'e' + rank, to: 'g' + rank }, { from: 'h' + rank, to: 'f' + rank },
    ]);
    assert.deepEqual(motionPaths({ from: 'e' + rank, to: 'c' + rank, flags: 'q' }), [
      { from: 'e' + rank, to: 'c' + rank }, { from: 'a' + rank, to: 'd' + rank },
    ]);
  }
});

test('capture visuals locate the victim for normal and en passant captures', () => {
  assert.equal(capturedSquare({ from: 'e5', to: 'd6', flags: 'e', captured: 'p' }), 'd5');
  assert.equal(capturedSquare({ from: 'd4', to: 'e3', flags: 'e', captured: 'p' }), 'e4');
  assert.equal(capturedSquare({ from: 'c3', to: 'd5', flags: 'c', captured: 'n' }), 'd5');
  assert.equal(capturedSquare({ from: 'e2', to: 'e4', flags: 'b' }), null);
});

test('the finishing queen and checkmated king are identifiable on the final board', () => {
  const game = new Chess();
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) game.move(move);
  assert.equal(game.isCheckmate(), true);
  assert.deepEqual(game.attackers('e1', 'b'), ['h4']);
  assert.equal(game.get('e1').type, 'k');
  assert.deepEqual(motionPaths(game.history({ verbose: true }).at(-1)), [{ from: 'd8', to: 'h4' }]);
});
