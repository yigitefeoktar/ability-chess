import { Chess } from './vendor/chess.js';
import { openings } from './openings.js';

const byId = id => document.getElementById(id);
const board = byId('board');
const files = 'abcdefgh';
const ranks = '87654321';
const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const colors = { w: 'White', b: 'Black' };
const opposite = color => color === 'w' ? 'b' : 'w';
let mode = 'bot';
let difficulty = 2;
let opening;
let openingMoves;
let game;
let round;
let firstColor;
let orientation;
let selected;
let focusSquare = 'e2';
let result;
let scores;
let worker;
let promotion;

const squares = new Map();
for (const rank of ranks) {
  for (const file of files) {
    const square = file + rank;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.square = square;
    squares.set(square, button);
  }
}

function pieceImage(color, type) {
  const image = document.createElement('img');
  image.src = './pieces/' + color + type.toUpperCase() + '.png';
  image.alt = '';
  return image;
}

function nameFor(color) {
  if (mode === 'bot') return color === firstColor ? 'You' : 'Bot';
  return color === firstColor ? 'Player 1' : 'Player 2';
}

function botTurn() {
  return mode === 'bot' && game.turn() !== firstColor;
}

function startRound() {
  stopBot();
  game = new Chess();
  openingMoves = opening.moves.split(' ');
  for (const move of openingMoves) game.move(move);
  selected = null;
  result = '';
  orientation = firstColor;
  focusSquare = game.moves({ verbose: true })[0].from;
  orderBoard();
  render();
  requestBot();
}

function newOpening() {
  const candidates = openings.filter(candidate => candidate !== opening);
  opening = candidates[Math.floor(Math.random() * candidates.length)] || openings[0];
  round = 1;
  firstColor = mode === 'bot' || Math.random() < .5 ? 'w' : 'b';
  scores = [0, 0];
  startRound();
}

function orderBoard() {
  const order = [...squares.values()];
  board.replaceChildren(...(orientation === 'w' ? order : order.reverse()));
}

function coord(text, type) {
  const label = document.createElement('span');
  label.setAttribute('aria-hidden', 'true');
  label.className = 'coord ' + type;
  label.textContent = text;
  return label;
}

function renderBoard() {
  const legal = selected ? game.moves({ square: selected, verbose: true }) : [];
  const targets = new Map(legal.map(move => [move.to, move]));
  const history = game.history({ verbose: true });
  const lastMove = history.length > openingMoves.length ? history.at(-1) : null;
  const inCheck = game.isCheck();
  for (const [square, button] of squares) {
    const [file, rank] = square;
    const fileIndex = files.indexOf(file);
    const rankIndex = ranks.indexOf(rank);
    const piece = game.get(square);
    const target = targets.get(square);
    const last = lastMove && (lastMove.from === square || lastMove.to === square);
    button.className = 'square ' + ((fileIndex + rankIndex) % 2 ? 'dark' : 'light');
    button.classList.toggle('selected', selected === square);
    button.classList.toggle('last', Boolean(last));
    button.classList.toggle('target', Boolean(target));
    button.classList.toggle('capture', Boolean(target?.captured));
    button.classList.toggle('check', inCheck && piece?.type === 'k' && piece.color === game.turn());
    button.setAttribute('aria-label', square + (piece ? ', ' + colors[piece.color] + ' ' + pieceNames[piece.type] : ', empty') + (target ? ', legal destination' : ''));
    button.tabIndex = focusSquare === square ? 0 : -1;
    button.replaceChildren();
    if (piece) {
      const image = pieceImage(piece.color, piece.type);
      image.draggable = !result && !botTurn() && piece.color === game.turn();
      button.append(image);
    }
    if (file === (orientation === 'w' ? 'a' : 'h')) button.append(coord(rank, 'rank'));
    if (rank === (orientation === 'w' ? '1' : '8')) button.append(coord(file, 'file'));
  }
}

function renderPlayer(element, color) {
  const icon = document.createElement('span');
  icon.className = 'player-icon';
  icon.append(pieceImage(color, 'k'));
  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = nameFor(color);
  const side = document.createElement('span');
  side.className = 'player-color';
  side.textContent = colors[color];
  element.replaceChildren(icon, name, side);
  if (!result && game.turn() === color) {
    const turn = document.createElement('span');
    turn.className = 'player-turn';
    turn.textContent = botTurn() ? 'Thinking' : 'To move';
    element.append(turn);
  }
}

function renderMoves() {
  const history = game.history();
  const list = byId('moves');
  const rows = document.createDocumentFragment();
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';
    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = i / 2 + 1 + '.';
    row.append(number);
    for (const index of [i, i + 1]) {
      const cell = document.createElement('span');
      cell.textContent = history[index] ?? '';
      if (index < openingMoves.length) cell.className = 'move-opening';
      else if (index === history.length - 1) cell.className = 'move-latest';
      row.append(cell);
    }
    rows.append(row);
  }
  list.replaceChildren(rows);
  list.scrollTop = list.scrollHeight;
  const openingTurn = Math.ceil(openingMoves.length / 2);
  byId('opening-length').textContent = openingMoves.length % 2
    ? 'After White’s move ' + openingTurn
    : 'After move ' + openingTurn;
}

function setStatus() {
  const turn = game.turn();
  byId('status').textContent = result || (botTurn()
    ? 'Bot is thinking…'
    : (mode === 'bot' ? 'Your move' : nameFor(turn) + ' to move') + (game.isCheck() ? ' · Check' : ''));
}

function render() {
  renderBoard();
  renderPlayer(byId('top-player'), opposite(orientation));
  renderPlayer(byId('bottom-player'), orientation);
  renderMoves();
  setStatus();
  byId('bot-mode').setAttribute('aria-pressed', mode === 'bot');
  byId('local-mode').setAttribute('aria-pressed', mode === 'local');
  byId('difficulty-row').hidden = mode !== 'bot';
  byId('round').textContent = 'Game ' + round + ' of 2';
  byId('resign').hidden = Boolean(result);
  byId('rematch').hidden = !result || round === 2;
  byId('score').hidden = round === 1 && !result;
  const [left, right] = mode === 'bot' ? ['You', 'Bot'] : ['Player 1', 'Player 2'];
  byId('score').textContent = `${left} ${scores[0]} · ${scores[1]} ${right}`;
}

function finish(winner, reason) {
  result = winner ? nameFor(winner) + (nameFor(winner) === 'You' ? ' win' : ' wins') + ' · ' + reason : 'Draw · ' + reason;
  if (winner) scores[winner === firstColor ? 0 : 1]++;
  else {
    scores[0] += .5;
    scores[1] += .5;
  }
  stopBot();
}

function play(move) {
  game.move(move);
  selected = null;
  if (game.isCheckmate()) finish(opposite(game.turn()), 'Checkmate');
  else if (game.isStalemate()) finish(null, 'Stalemate');
  else if (game.isInsufficientMaterial()) finish(null, 'Insufficient material');
  else if (game.isThreefoldRepetition()) finish(null, 'Threefold repetition');
  else if (game.isDrawByFiftyMoves()) finish(null, 'Fifty-move rule');
  render();
  requestBot();
}

function chooseMove(from, to) {
  const choices = game.moves({ square: from, verbose: true }).filter(move => move.to === to);
  if (!choices.length) return false;
  if (choices.length === 1) {
    play(choices[0]);
    return true;
  }
  promotion = choices;
  const options = byId('promotion-options');
  options.replaceChildren(...['q', 'r', 'b', 'n'].map(type => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.promotion = type;
    button.setAttribute('aria-label', 'Promote to ' + pieceNames[type]);
    button.append(pieceImage(game.turn(), type));
    return button;
  }));
  byId('promotion-dialog').showModal();
  return true;
}

board.addEventListener('click', event => {
  const square = event.target.closest('.square')?.dataset.square;
  if (!square || result || botTurn()) return;
  focusSquare = square;
  if (selected && selected !== square && chooseMove(selected, square)) return;
  selected = selected !== square && game.get(square)?.color === game.turn() ? square : null;
  renderBoard();
});

board.addEventListener('keydown', event => {
  const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
  const step = steps[event.key];
  if (!step || !event.target.matches('.square')) return;
  event.preventDefault();
  const order = [...board.children];
  const index = order.indexOf(event.target);
  if ((step === -1 && index % 8 === 0) || (step === 1 && index % 8 === 7)) return;
  const next = order[index + step];
  if (next) next.focus();
});

board.addEventListener('focusin', event => {
  if (!event.target.matches('.square')) return;
  squares.get(focusSquare).tabIndex = -1;
  focusSquare = event.target.dataset.square;
  event.target.tabIndex = 0;
});

board.addEventListener('dragstart', event => {
  const square = event.target.closest('.square')?.dataset.square;
  if (!square || !event.target.draggable) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', square);
});
board.addEventListener('dragover', event => {
  if (!result && !botTurn() && event.target.closest('.square')) event.preventDefault();
});
board.addEventListener('drop', event => {
  const to = event.target.closest('.square')?.dataset.square;
  const from = event.dataTransfer.getData('text/plain');
  if (!to || !squares.has(from) || result || botTurn()) return;
  event.preventDefault();
  chooseMove(from, to);
});

function stopBot() {
  worker?.terminate();
  worker = null;
}

function requestBot() {
  if (worker || result || !botTurn()) return;
  const moves = game.moves({ verbose: true });
  const fallback = () => moves.find(move => move.promotion === 'q') ?? moves[0];
  try {
    worker = new Worker(new URL('./bot.js', import.meta.url), { type: 'module' });
  } catch {
    play(fallback());
    return;
  }
  const pending = worker;
  const commit = choice => {
    if (worker !== pending || result) return;
    stopBot();
    const move = moves.find(candidate => candidate.lan === choice) ?? fallback();
    play(move);
  };
  worker.onmessage = event => commit(event.data);
  worker.onerror = () => commit(null);
  worker.postMessage({ moves: game.history(), difficulty });
}

function selectMode(next) {
  if (mode === next) return;
  mode = next;
  newOpening();
}

byId('bot-mode').onclick = () => selectMode('bot');
byId('local-mode').onclick = () => selectMode('local');
byId('difficulty').onchange = event => {
  difficulty = Number(event.target.value);
  if (worker) {
    stopBot();
    requestBot();
  }
};
byId('shuffle').onclick = newOpening;
byId('rematch').onclick = () => {
  if (!result || round !== 1) return;
  round = 2;
  firstColor = opposite(firstColor);
  startRound();
};
byId('flip').onclick = () => {
  orientation = opposite(orientation);
  orderBoard();
  render();
};
byId('rules-open').onclick = () => byId('rules-dialog').showModal();
for (const button of document.querySelectorAll('[data-close]')) {
  button.onclick = () => button.closest('dialog').close();
}
byId('promotion-options').onclick = event => {
  const type = event.target.closest('button')?.dataset.promotion;
  const move = promotion?.find(choice => choice.promotion === type);
  if (!move) return;
  byId('promotion-dialog').close();
  play(move);
};
byId('promotion-dialog').addEventListener('close', () => { promotion = null; });
byId('resign').onclick = () => {
  const color = mode === 'bot' ? firstColor : game.turn();
  byId('resign-text').textContent = nameFor(color) === 'You'
    ? 'You are playing ' + colors[color] + '. Resigning gives the Bot the win.'
    : nameFor(color) + ' is playing ' + colors[color] + ' and will concede this game.';
  byId('resign-dialog').showModal();
};
byId('confirm-resign').onclick = () => {
  const color = mode === 'bot' ? firstColor : game.turn();
  byId('resign-dialog').close();
  if (!result) {
    selected = null;
    finish(opposite(color), 'Resignation');
    render();
  }
};

newOpening();
