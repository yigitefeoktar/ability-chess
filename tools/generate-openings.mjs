import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFile } from 'node:fs/promises';
import { Chess } from '../dist/vendor/chess.js';

const [engine, ...engineArgs] = process.argv.slice(2);
if (!engine) throw new Error('Pass a Stockfish executable and any arguments.');
const target = Number(process.env.OPENING_COUNT || 120);
const child = spawn(engine, engineArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
const send = command => child.stdin.write(command + '\n');
const output = new URL('../dist/openings.js', import.meta.url);
let seed = 338079;

function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
}

async function waitFor(accept) {
  for (;;) {
    const { value, done } = await lines.next();
    if (done) throw new Error('Stockfish stopped unexpectedly.');
    if (accept(value)) return value;
  }
}

async function evaluate(game, nodes) {
  send('position startpos moves ' + game.history({ verbose: true }).map(move => move.lan).join(' '));
  send('go nodes ' + nodes);
  const depths = new Map();
  await waitFor(line => {
    const match = line.match(/^info depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (\w+)/);
    if (match) {
      const [, depth, index, kind, score, move] = match;
      if (!depths.has(+depth)) depths.set(+depth, []);
      depths.get(+depth)[index - 1] = { score: kind === 'cp' ? +score : Math.sign(+score) * 10000, move };
    }
    return line.startsWith('bestmove');
  });
  return [...depths.values()].reverse().find(entries => [0, 1, 2].every(i => entries[i])) || [];
}

function pickMove(game) {
  const moves = game.moves({ verbose: true }).filter(move => !move.captured && !/[+#]/.test(move.san));
  const weights = moves.map(move => {
    const file = move.from[0];
    const home = move.color === 'w' ? '1' : '8';
    if (move.piece === 'p') return 'cdef'.includes(file) ? 8 : 'bg'.includes(file) ? 4 : 1.5;
    if ('bn'.includes(move.piece) && move.from[1] === home) {
      return 'ah'.includes(move.to[0]) ? 3 : 12;
    }
    if (move.isKingsideCastle() || move.isQueensideCastle()) return 9;
    return move.piece === 'k' || move.piece === 'r' ? 0.15 : 1.2;
  });
  let cursor = random() * weights.reduce((sum, weight) => sum + weight, 0);
  return moves.find((move, index) => (cursor -= weights[index]) < 0);
}

async function save(pool) {
  const rows = pool.map(opening => '  ' + JSON.stringify(opening));
  await writeFile(output, 'export const openings = [\n' + rows.join(',\n') + '\n];\n');
}

const seen = new Set();
const pool = [];
try {
  send('uci');
  await waitFor(line => line === 'uciok');
  send('setoption name MultiPV value 3');
  send('isready');
  await waitFor(line => line === 'readyok');
  for (let attempts = 0; pool.length < target && attempts < 3000; attempts++) {
    const game = new Chess();
    const length = 8 + Math.floor(random() * 5);
    while (game.history().length < length) {
      const move = pickMove(game);
      if (!move) break;
      game.move(move);
    }
    if (game.history().length !== length) continue;
    const position = game.fen().split(' ').slice(0, 4).join(' ');
    if (seen.has(position)) continue;
    seen.add(position);

    const screen = await evaluate(game, 11000);
    if (!screen.length || Math.abs(screen[0].score) > 50 || screen[2].score < -85) continue;
    const options = await evaluate(game, 65000);
    if (!options.length || Math.abs(options[0].score) > 30 || options[2].score < -70) continue;

    const best = options[0].move;
    game.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
    const replies = await evaluate(game, 40000);
    game.undo();
    if (!replies.length || Math.abs(replies[0].score) > 40 || replies[2].score < -75) continue;
    const evaluation = game.turn() === 'w' ? options[0].score : -options[0].score;
    pool.push({ moves: game.history().join(' '), evaluation: evaluation || 0 });
    if (pool.length % 10 === 0) {
      await save(pool);
      console.log(`Accepted ${pool.length} after ${attempts + 1} candidates`);
    }
  }
  await save(pool);
  console.log(`Saved ${pool.length} openings`);
  if (pool.length < target) process.exitCode = 1;
} finally {
  send('quit');
}
