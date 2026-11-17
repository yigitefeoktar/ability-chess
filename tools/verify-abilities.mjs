import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chess, abilityBadges, movementAbilities } from '../dist/ability-chess.js';
import { automaticEnding, drawClaims, positionCounts, replayOpening, restoreMatch, saveMatch } from '../dist/match.js';

const play = (game, moves) => moves.split(' ').forEach(move => game.move(move));
const destinations = (game, square) => game.moves({ square, verbose: true }).map(move => move.to);

// FEN describes the original types; add metadata for focused movement fixtures.
function endowed(fen, square, abilities) {
  const game = new Chess(fen);
  const index = (8 - Number(square[1])) * 16 + square.charCodeAt(0) - 97;
  game._set(index, { ...game.get(square), abilities });
  game._positionCount = new Map([[game._hash, 1]]);
  return game;
}

test('normal starting position and initial move tree match standard chess', () => {
  const game = new Chess();
  assert.equal(game.fen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(game.perft(1), 20);
  assert.equal(game.perft(2), 400);
  assert.equal(game.perft(3), 8902);
});

test('a capture adds movement, and a later capture inherits the entire set', () => {
  const game = new Chess('7k/8/2r5/8/8/2b5/8/1N5K w - - 0 1');
  play(game, 'b1c3');
  assert.deepEqual(abilityBadges(game.get('c3')), ['b']);
  assert.equal(game.isCheck(), true);
  play(game, 'c6c3');
  assert.deepEqual(movementAbilities(game.get('c3')).sort(), ['b', 'n', 'r']);
  assert.deepEqual(abilityBadges(game.get('c3')), ['n', 'b']);
  game.undo();
  assert.deepEqual(abilityBadges(game.get('c3')), ['b']);
  assert.equal(game.get('c6').type, 'r');
});

test('queen movement has no duplicate bishop, rook, or pawn abilities', () => {
  const game = new Chess('7k/8/8/8/8/2q5/8/1N5K w - - 0 1');
  play(game, 'b1c3');
  assert.deepEqual(abilityBadges(game.get('c3')), ['q']);
  const queen = new Chess();
  play(queen, 'e4 d5 exd5 Qxd5');
  assert.deepEqual(abilityBadges(queen.get('d5')), []);
});

test('the king captures normally without inheriting any movement', () => {
  const game = endowed('7k/8/8/8/8/8/3b4/4K3 w - - 0 1', 'd2', ['n', 'r']);
  game.move('Kxd2');
  assert.deepEqual(abilityBadges(game.get('d2')), []);
  assert.ok(!destinations(game, 'd2').includes('d6'));
});

test('inherited knights can jump, while inherited sliders remain blocked', () => {
  const knight = endowed('7k/8/8/8/8/8/PP6/R6K w - - 0 1', 'a1', ['n']);
  assert.ok(destinations(knight, 'a1').includes('b3'));
  assert.ok(!destinations(knight, 'a1').includes('a3'));
  const bishop = endowed('7k/8/8/8/8/8/1P6/N6K w - - 0 1', 'a1', ['b']);
  assert.ok(!destinations(bishop, 'a1').includes('c3'));
});

test('inherited attacks constrain king moves, pins, and castling', () => {
  const game = endowed('4k3/8/8/8/8/8/6n1/R3K2R w KQ - 0 1', 'g2', ['r']);
  assert.ok(!game.moves().includes('O-O'));
  const pinned = endowed('4n2k/8/8/8/8/8/4R3/4K3 w - - 0 1', 'e8', ['r']);
  assert.ok(!destinations(pinned, 'e2').includes('d2'));
  const check = endowed('7k/8/8/8/8/8/2b5/4K3 w - - 0 1', 'c2', ['n']);
  assert.equal(check.isCheck(), true);
  assert.ok(check.moves().length > 0);
});

test('pawn movement keeps its direction and cannot grant other pieces pawn special moves', () => {
  const white = endowed('7k/8/8/2p1p3/3N4/8/8/7K w - - 0 1', 'd4', ['p']);
  assert.ok(destinations(white, 'd4').includes('d5'));
  assert.ok(destinations(white, 'd4').includes('c5'));
  assert.ok(!destinations(white, 'd4').includes('d3'));
  const black = endowed('7k/8/8/3n4/2P1P3/8/8/7K b - - 0 1', 'd5', ['p']);
  assert.ok(destinations(black, 'd5').includes('d4'));
  assert.ok(destinations(black, 'd5').includes('e4'));
  const home = endowed('7k/8/8/8/8/8/3B4/7K w - - 0 1', 'd2', ['p']);
  assert.ok(!destinations(home, 'd2').includes('d4'));
});

test('en passant transfers the captured pawn’s extra abilities and undo restores it', () => {
  const game = endowed('7k/8/8/3pP3/8/8/8/7K w - d6 0 1', 'd5', ['n']);
  // An enhanced pawn can also reach d6 by bishop movement: en passant takes precedence.
  game._set(52, { ...game.get('e5'), abilities: ['b'] });
  game.move('e5d6');
  assert.equal(game.get('d5'), undefined);
  assert.deepEqual(abilityBadges(game.get('d6')), ['n', 'b']);
  game.undo();
  assert.deepEqual(abilityBadges(game.get('d5')), ['n']);
  assert.deepEqual(abilityBadges(game.get('e5')), ['b']);
});

test('enhanced pawns promote using acquired moves and preserve extra movement', () => {
  const game = endowed('7k/8/P7/8/8/8/8/7K w - - 0 1', 'a6', ['n']);
  const promotions = game.moves({ square: 'a6', verbose: true }).filter(move => move.to === 'b8');
  assert.deepEqual(promotions.map(move => move.promotion).sort(), ['b', 'n', 'q', 'r']);
  game.move('a6b8q');
  assert.equal(game.get('b8').type, 'q');
  assert.deepEqual(abilityBadges(game.get('b8')), ['n']);
  assert.equal(automaticEnding(game), null);
  game.undo();
  assert.equal(game.get('a6').type, 'p');
  assert.deepEqual(abilityBadges(game.get('a6')), ['n']);
});

test('returning to the second rank does not restore a pawn’s double step', () => {
  const game = endowed('7k/8/8/8/8/8/3P4/7K w - - 0 1', 'd2', ['n']);
  play(game, 'd2f3 h8g8 f3d2 g8h8');
  assert.ok(!destinations(game, 'd2').includes('d4'));
});

test('castling keeps the rook’s powers, and undo preserves the full position hash', () => {
  const game = endowed('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'h1', ['n']);
  const hash = game.positionKey();
  game.move('O-O');
  assert.deepEqual(abilityBadges(game.get('f1')), ['n']);
  game.undo();
  assert.equal(game.positionKey(), hash);
  assert.deepEqual(abilityBadges(game.get('h1')), ['n']);
});

test('draw rules include abilities and enhanced minor pieces are not bare material', () => {
  const enhanced = endowed('7k/8/8/8/8/8/8/1N5K w - - 0 1', 'b1', ['b']);
  assert.equal(enhanced.isInsufficientMaterial(), false);
  assert.equal(endowed('7k/8/8/8/8/8/8/1B5K w - - 0 1', 'b1', ['p']).isInsufficientMaterial(), true);
  const plain = new Chess(enhanced.fen());
  assert.notEqual(enhanced.positionKey(), plain.positionKey());
  const game = new Chess();
  play(game, 'Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1');
  assert.deepEqual(drawClaims(game).byMove.map(({ move }) => move.san), ['Ng8']);
  game.move('Ng8');
  assert.equal(drawClaims(game).current, 'Threefold repetition');
  play(game, 'Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8');
  assert.equal(automaticEnding(game).reason, 'Fivefold repetition');
});

test('history, storage recovery, and bot coordinates preserve acquired abilities', () => {
  const opening = { moves: '' };
  const game = replayOpening(opening);
  play(game, 'e4 d5 exd5 Qxd5 Nc3 Qe6+ Be2 Qxe2+ Ngxe2');
  assert.deepEqual(abilityBadges(game.get('e2')), ['q']);
  const hash = game.positionKey();
  const counts = positionCounts(game);
  const coordinates = game.history({ verbose: true }).map(move => move.lan);
  assert.equal(game.positionKey(), hash);
  const replay = replayOpening(opening, coordinates);
  assert.equal(replay.positionKey(), hash);
  assert.deepEqual(replay.board(), game.board());
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  saveMatch(storage, { opening, game, mode: 'local', difficulty: 2, round: 1, firstColor: 'w', orientation: 'w', scores: [0, 0], ending: null });
  const restored = restoreMatch(storage, [opening]);
  assert.deepEqual(restored.game.board(), game.board());
  assert.deepEqual(positionCounts(restored.game), counts);
});
