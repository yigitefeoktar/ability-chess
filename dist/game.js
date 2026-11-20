import { createMoveAnimator, createResultsPause } from './motion.js';
import { difficultyFor } from './difficulty.js';
import { abilityBadges } from './ability-chess.js';
const openings = [{ moves: '' }];
import { automaticEnding, currentDrawClaim, drawClaims, opposite, replayOpening, resignation, restoreMatch, saveMatch } from './match.js';

const byId = id => document.getElementById(id);
const board = byId('board');
const colorControl = byId('player-color');
const colorPreferenceKey = 'ability-chess-player-color';
const files = 'abcdefgh';
const ranks = '87654321';
const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const colors = { w: 'White', b: 'Black' };
let mode = 'bot';
let difficulty = 2;
let opening;
let openingMoves;
let game;
let round;
let firstColor;
let selected;
let focusSquare = 'e2';
let ending;
let scores;
let worker;
let promotion;
let claims;
let screen = 'menu';
let setupMode = mode;
let setupDifficulty = difficulty;
let animating = false;
let moveSequence = 0;
let reviewPinned = false;
const resultsPause = createResultsPause();

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

const moveAnimator = createMoveAnimator(squares);

function pieceImage(color, type) {
  const image = document.createElement('img');
  image.src = './pieces/' + color + type.toUpperCase() + '.png';
  image.alt = '';
  return image;
}

function nameFor(color) {
  if (mode === 'bot') return color === firstColor ? 'You' : difficultyFor(difficulty).name + ' Bot';
  return color === firstColor ? 'Player 1' : 'Player 2';
}

function botTurn() {
  return mode === 'bot' && game.turn() !== firstColor;
}

function startRound() {
  stopBot();
  cancelPresentation();
  reviewPinned = false;
  game = replayOpening(opening);
  openingMoves = opening.moves.split(' ').filter(Boolean);
  selected = null;
  ending = null;
  focusSquare = game.moves({ verbose: true })[0]?.from ?? 'e2';
  orderBoard();
  showScreen('game');
}

function newOpening() {
  const candidates = openings.filter(candidate => candidate !== opening);
  opening = candidates[Math.floor(Math.random() * candidates.length)] || openings[0];
  round = 1;
  firstColor = colorControl.value;
  scores = [0, 0];
  startRound();
}

function orderBoard() {
  const order = [...squares.values()];
  board.replaceChildren(...(firstColor === 'w' ? order : order.reverse()));
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
  const attackers = matingAttackers();
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
    button.classList.toggle('mating-attacker', attackers.includes(square));
    const badges = piece ? abilityBadges(piece) : [];
    const extraLabel = badges.length ? ', with ' + badges.map(type => pieceNames[type] + ' movement').join(', ') : '';
    button.setAttribute('aria-label', square + (piece ? ', ' + colors[piece.color] + ' ' + pieceNames[piece.type] + extraLabel : ', empty') + (target ? ', legal destination' : ''));
    button.tabIndex = focusSquare === square ? 0 : -1;
    button.replaceChildren();
    if (piece) {
      const image = pieceImage(piece.color, piece.type);
      image.draggable = !animating && !ending && !botTurn() && piece.color === game.turn();
      const visual = document.createElement('span');
      visual.className = 'piece';
      visual.append(image);
      button.append(visual);
      if (badges.length) {
        const overlay = document.createElement('span');
        overlay.className = 'ability-badges';
        overlay.setAttribute('aria-hidden', 'true');
        for (const type of badges) {
          const badge = pieceImage(piece.color, type);
          badge.draggable = false;
          overlay.append(badge);
        }
        visual.append(overlay);
      }
    }
    if (file === (firstColor === 'w' ? 'a' : 'h')) button.append(coord(rank, 'rank'));
    if (rank === (firstColor === 'w' ? '1' : '8')) button.append(coord(file, 'file'));
  }
}

function renderPlayer(element, color, history) {
  const icon = document.createElement('span');
  icon.className = 'player-icon';
  icon.append(pieceImage(color, 'k'));
  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = nameFor(color);
  const side = document.createElement('span');
  side.className = 'player-color';
  side.textContent = colors[color];
  const identity = document.createElement('div');
  identity.className = 'player-identity';
  identity.append(name, side);
  element.replaceChildren(icon, identity);
  const active = !ending && game.turn() === color;
  element.classList.toggle('active-player', active);
  const captures = history.filter(move => move.color === color && move.captured);
  if (captures.length) {
    const tray = document.createElement('span');
    tray.className = 'captures';
    const captured = captures.map(move => move.captured);
    tray.setAttribute('aria-label', 'Captured: ' + captured.map(type => pieceNames[type]).join(', '));
    for (const type of captured) tray.append(pieceImage(opposite(color), type));
    element.append(tray);
  }
  if (active) {
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
  list.scrollTop = history.length > openingMoves.length ? list.scrollHeight : 0;
  byId('opening-length').textContent = history.length ? Math.ceil(history.length / 2) + ' played' : 'Starting position';
}

function winnerText(name) {
  return name === 'You' ? 'You win' : name + ' wins';
}

function gameResult() {
  return ending.winner ? winnerText(nameFor(ending.winner)) : 'Draw';
}

function playerNames() {
  return mode === 'bot' ? ['You', difficultyFor(difficulty).name + ' Bot'] : ['Player 1', 'Player 2'];
}

function setStatus() {
  const turn = game.turn();
  byId('status').classList.toggle('finished', Boolean(ending));
  byId('status').textContent = ending
    ? gameResult() + ' · ' + ending.reason
    : botTurn()
    ? 'Bot is thinking…'
    : (mode === 'bot' ? 'Your move' : nameFor(turn) + ' to move') + (game.isCheck() ? ' · Check' : '');
}

function rememberMatch() {
  try {
    saveMatch(sessionStorage, { opening, game, mode, difficulty, round, firstColor, orientation: firstColor, scores, ending, screen });
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

function renderMenu() {
  byId('bot-mode').setAttribute('aria-pressed', setupMode === 'bot');
  byId('local-mode').setAttribute('aria-pressed', setupMode === 'local');
  byId('difficulty-row').hidden = setupMode !== 'bot';
  byId('difficulty').value = setupDifficulty;
  byId('difficulty-description').hidden = setupMode !== 'bot';
  byId('difficulty-description').textContent = difficultyFor(setupDifficulty).description;
  byId('color-label').textContent = setupMode === 'bot' ? 'Play as' : 'Player 1 color';
  byId('resume').hidden = !game;
  byId('resume').textContent = ending ? 'View results' : 'Resume game';
}

function renderResults() {
  const [left, right] = playerNames();
  byId('results-title').textContent = gameResult();
  byId('results-reason').textContent = 'Game ' + round + ' of 2 · ' + ending.reason;
  byId('results-emblem').replaceChildren(...(ending.winner
    ? [pieceImage(ending.winner, 'k')]
    : [pieceImage('w', 'k'), pieceImage('b', 'k')]));
  const matchLeader = scores[0] > scores[1] ? left : right;
  byId('match-outcome').textContent = round === 1 ? 'Match score'
    : scores[0] === scores[1] ? 'Match tied' : winnerText(matchLeader) + ' the match';
  byId('first-name').textContent = left;
  byId('second-name').textContent = right;
  byId('first-score').textContent = scores[0];
  byId('second-score').textContent = scores[1];
  byId('rematch').hidden = round !== 1;
  byId('new-opening').hidden = round !== 2;
}

function cancelPresentation() {
  moveSequence++;
  moveAnimator.cancel();
  resultsPause.cancel();
  animating = false;
}

function showScreen(next, moveFocus = true) {
  if (next !== 'game') cancelPresentation();
  screen = next;
  if (next !== 'game') stopBot();
  for (const name of ['menu', 'game', 'results']) byId(name + '-screen').hidden = name !== next;
  byId('brand').hidden = next === 'game';
  byId('menu-open').hidden = next !== 'game';
  if (next === 'menu') renderMenu();
  else if (next === 'results') renderResults();
  else render();
  if (game && next !== 'game') rememberMatch();
  if (moveFocus) {
    window.scrollTo(0, 0);
    byId(next + '-title').focus({ preventScroll: true });
  }
  if (next === 'game') requestBot();
}

function render() {
  const history = game.history({ verbose: true });
  claims = !animating && !ending && !botTurn() ? drawClaims(game) : null;
  renderBoard();
  renderPlayer(byId('top-player'), opposite(firstColor), history);
  renderPlayer(byId('bottom-player'), firstColor, history);
  renderMoves();
  setStatus();
  byId('round').textContent = 'Game ' + round + ' of 2';
  byId('resign').hidden = Boolean(ending);
  byId('resign').disabled = animating;
  byId('claim').hidden = !(claims?.current || claims?.byMove.length);
  byId('return-results').hidden = !ending;
  byId('return-results').textContent = ending?.reason === 'Checkmate' ? 'View results' : 'Back to results';
  byId('keep-reviewing').hidden = ending?.reason !== 'Checkmate' || reviewPinned;
  renderCheckmate();
  byId('score').hidden = round === 1 && !ending;
  const [left, right] = playerNames();
  byId('score').textContent = `${left} ${scores[0]} · ${scores[1]} ${right}`;
  rememberMatch();
}

function matingAttackers() {
  if (ending?.reason !== 'Checkmate') return [];
  const king = game.board().flat().find(piece => piece?.type === 'k' && piece.color === game.turn());
  return king ? game.attackers(king.square, opposite(king.color)) : [];
}

function renderCheckmate() {
  const panel = byId('checkmate-explanation');
  panel.hidden = ending?.reason !== 'Checkmate';
  if (panel.hidden) return;
  const attackers = matingAttackers().map(square => pieceNames[game.get(square).type] + ' on ' + square);
  byId('checkmate-detail').textContent = attackers.length
    ? 'The ' + attackers.join(' and ') + ' ' + (attackers.length > 1 ? 'check' : 'checks') + ' the king. No legal move can remove the check.'
    : 'The king is in check, and no legal move can remove the check.';
  byId('checkmate-pause').textContent = reviewPinned
    ? 'Take your time. Choose View results when you’re ready.'
    : 'Results will appear shortly. Choose Keep reviewing to stay here.';
}

function finish(result, onBoard = false) {
  if (ending) return;
  ending = result;
  selected = null;
  stopBot();
  const { winner } = result;
  if (winner) scores[winner === firstColor ? 0 : 1]++;
  else {
    scores[0] += .5;
    scores[1] += .5;
  }
  if (byId('resign-dialog').open) byId('resign-dialog').close();
  if (onBoard) render();
  else showScreen('results');
}

async function play(move) {
  if (animating || ending || screen !== 'game') return;
  const before = moveAnimator.snapshot();
  const moved = game.move(move);
  const sequence = ++moveSequence;
  selected = null;
  animating = true;
  const automatic = automaticEnding(game);
  if (automatic) finish(automatic, true);
  else render();
  try {
    await moveAnimator.play(moved, before);
  } finally {
    if (sequence === moveSequence) animating = false;
  }
  if (sequence !== moveSequence || screen !== 'game') return;
  render();
  if (automatic) {
    if (automatic.reason === 'Checkmate') {
      if (!reviewPinned) resultsPause.start(() => showScreen('results'));
    } else showScreen('results');
    return;
  }
  requestBot();
}

function chooseMove(from, to) {
  if (animating || ending || screen !== 'game') return false;
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
  if (!square || animating || ending || botTurn()) return;
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
  if (!square || animating || ending || !event.target.draggable) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', square);
});
board.addEventListener('dragover', event => {
  if (!animating && !ending && !botTurn() && event.target.closest('.square')) event.preventDefault();
});
board.addEventListener('drop', event => {
  const to = event.target.closest('.square')?.dataset.square;
  const from = event.dataTransfer.getData('text/plain');
  if (!to || !squares.has(from) || animating || ending || botTurn()) return;
  event.preventDefault();
  chooseMove(from, to);
});

function stopBot() {
  worker?.terminate();
  worker = null;
}

function requestBot() {
  if (screen !== 'game' || animating || worker || ending || !botTurn()) return;
  const moves = game.moves({ verbose: true });
  const fallback = () => moves.find(move => move.promotion === 'q') ?? moves[0];
  try {
    worker = new Worker(new URL('./bot.js?v=6', import.meta.url), { type: 'module' });
  } catch {
    play(fallback());
    return;
  }
  const pending = worker;
  const commit = choice => {
    if (worker !== pending || ending) return;
    stopBot();
    const claim = choice === 'claim' && currentDrawClaim(game);
    if (claim) {
      finish({ winner: null, reason: claim });
      return;
    }
    const move = moves.find(candidate => candidate.lan === choice) ?? fallback();
    play(move);
  };
  worker.onmessage = event => commit(event.data);
  worker.onerror = () => commit(null);
  worker.postMessage({ moves: game.history({ verbose: true }).map(move => move.lan), difficulty });
}

function startFromMenu() {
  mode = setupMode;
  difficulty = setupDifficulty;
  newOpening();
}

function askRestart() {
  if (!game || ending) {
    startFromMenu();
    return;
  }
  const humanMoved = game.history({ verbose: true }).slice(openingMoves.length)
    .some(move => mode === 'local' || move.color === firstColor);
  if (round === 2 || humanMoved) byId('restart-dialog').showModal();
  else startFromMenu();
}

byId('bot-mode').onclick = () => { setupMode = 'bot'; renderMenu(); };
byId('local-mode').onclick = () => { setupMode = 'local'; renderMenu(); };
byId('difficulty').onchange = event => { setupDifficulty = difficultyFor(Number(event.target.value)).id; renderMenu(); };
byId('shuffle').onclick = askRestart;
byId('confirm-restart').onclick = () => {
  byId('restart-dialog').close();
  startFromMenu();
};
byId('menu-open').onclick = () => showScreen('menu');
byId('resume').onclick = () => showScreen(ending ? 'results' : 'game');
byId('results-menu').onclick = () => showScreen('menu');
byId('review-board').onclick = () => { reviewPinned = true; showScreen('game'); };
byId('return-results').onclick = () => showScreen('results');
byId('keep-reviewing').onclick = () => {
  reviewPinned = true;
  resultsPause.cancel();
  renderCheckmate();
  byId('keep-reviewing').hidden = true;
};
byId('new-opening').onclick = newOpening;
byId('rematch').onclick = () => {
  if (!ending || round !== 1) return;
  round = 2;
  firstColor = opposite(firstColor);
  startRound();
};
colorControl.onchange = () => {
  try {
    sessionStorage.setItem(colorPreferenceKey, colorControl.value);
  } catch {
    // The option still works for the current page.
  }
};
byId('rules-open').onclick = () => byId('rules-dialog').showModal();
for (const button of document.querySelectorAll('[data-close]')) {
  button.onclick = () => button.closest('dialog').close();
}
byId('promotion-options').onclick = event => {
  const type = event.target.closest('button')?.dataset.promotion;
  const move = promotion?.find(choice => choice.promotion === type);
  if (!move) return;
  promotion = null;
  byId('promotion-dialog').close();
  play(move);
};
byId('promotion-dialog').addEventListener('close', () => { promotion = null; });
byId('resign').onclick = () => {
  const color = mode === 'bot' ? firstColor : game.turn();
  const outcome = resignation(game, color);
  byId('resign-text').textContent = outcome.winner
    ? nameFor(opposite(color)) + (nameFor(opposite(color)) === 'You' ? ' win' : ' wins') + ' if ' + colors[color] + ' resigns.'
    : colors[color] + ' can resign for a draw because the opponent has only a king.';
  byId('resign-dialog').showModal();
};
byId('confirm-resign').onclick = () => {
  const color = mode === 'bot' ? firstColor : game.turn();
  byId('resign-dialog').close();
  if (!ending) {
    finish(resignation(game, color));
  }
};

byId('claim').onclick = () => {
  if (!claims?.current && !claims?.byMove.length) return;
  byId('claim-choose').hidden = Boolean(claims.current);
  byId('claim-text').textContent = claims.current
    ? claims.current + ' applies to this position.'
    : 'Select a move that would make a draw claim valid.';
  byId('claim-move').replaceChildren(...claims.byMove.map(({ move, reason }, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = move.san + ' · ' + reason;
    return option;
  }));
  byId('claim-dialog').showModal();
};

byId('confirm-claim').onclick = () => {
  const choice = claims?.byMove[Number(byId('claim-move').value)];
  const reason = claims?.current ?? (choice ? choice.reason + ' with ' + choice.move.san : null);
  byId('claim-dialog').close();
  if (ending || !reason) return;
  finish({ winner: null, reason });
};

let restored;
try {
  const color = sessionStorage.getItem(colorPreferenceKey)
    ?? (sessionStorage.getItem('opening-shuffle-flip-board') === 'true' ? 'b' : 'w');
  colorControl.value = color === 'b' ? 'b' : 'w';
  restored = restoreMatch(sessionStorage, openings);
} catch {
  // Ignore a stale or inaccessible snapshot.
}
if (restored) {
  ({ opening, game, mode, difficulty, round, firstColor, scores, ending } = restored);
  setupMode = mode;
  setupDifficulty = difficulty;
  reviewPinned = Boolean(ending);
  openingMoves = opening.moves.split(' ').filter(Boolean);
  focusSquare = game.moves({ verbose: true })[0]?.from ?? 'e2';
  orderBoard();
  const initialScreen = restored.screen === 'menu' ? 'menu'
    : ending && restored.screen !== 'game' ? 'results' : 'game';
  showScreen(initialScreen, false);
} else {
  showScreen('menu', false);
}
