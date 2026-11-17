import { Chess as StandardChess } from './vendor/chess.js';

// Movement families are canonical: a queen has both bishop and rook movement.
const families = type => type === 'q' ? ['b', 'r'] : [type];
const order = ['p', 'n', 'b', 'r'];
const offsets = {
  n: [-18, -33, -31, -14, 18, 33, 31, 14],
  b: [-17, -15, 17, 15],
  r: [-16, 1, 16, -1],
  k: [-17, -16, -15, 1, 17, 16, 15, -1],
};
const NORMAL = 1, CAPTURE = 2, BIG_PAWN = 4, EP_CAPTURE = 8, PROMOTION = 16;
const squareName = square => 'abcdefgh'[square & 7] + '87654321'[square >> 4];
const squareIndex = square => (8 - Number(square[1])) * 16 + square.charCodeAt(0) - 97;

export function movementAbilities(piece) {
  const abilities = new Set([...families(piece.type), ...(piece.abilities ?? [])]);
  if (abilities.has('b') && abilities.has('r')) abilities.delete('p');
  return [...abilities];
}

export function abilityBadges(piece) {
  const added = [...(piece.abilities ?? [])];
  if (added.includes('b') && added.includes('r')) {
    return [...added.filter(type => type !== 'b' && type !== 'r'), 'q'];
  }
  return added;
}

export class Chess extends StandardChess {
  _pieceKey(index) {
    let key = super._pieceKey(index);
    const piece = this._board[index];
    if (!piece) return key;
    // Extend chess.js's position hash so repetition includes movement abilities.
    const mask = (piece.abilities ?? []).reduce((bits, type) => bits | (1 << order.indexOf(type)), 0)
      | (piece.type === 'p' && piece.moved ? 16 : 0);
    if (mask) {
      let extra = BigInt(1 + index + 128 * mask + (piece.color === 'w' ? 0 : 8192));
      extra = BigInt.asUintN(64, (extra ^ (extra >> 30n)) * 0xbf58476d1ce4e5b9n);
      extra = BigInt.asUintN(64, (extra ^ (extra >> 27n)) * 0x94d049bb133111ebn);
      key ^= extra ^ (extra >> 31n);
    }
    return key;
  }

  _attacked(color, square, verbose = false) {
    const attackers = [];
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const piece = this._board[from];
      if (!piece || piece.color !== color || from === square) continue;
      let attacks = false;
      for (const ability of movementAbilities(piece)) {
        if (ability === 'p') {
          const forward = color === 'w' ? -16 : 16;
          attacks ||= square === from + forward - 1 || square === from + forward + 1;
          continue;
        }
        for (const offset of offsets[ability]) {
          for (let to = from + offset; !(to & 0x88); to += offset) {
            if (to === square) { attacks = true; break; }
            if (this._board[to] || ability === 'n' || ability === 'k') break;
          }
          if (attacks) break;
        }
        if (attacks) break;
      }
      if (attacks) {
        if (!verbose) return true;
        attackers.push(squareName(from));
      }
    }
    return verbose ? attackers : false;
  }

  _moves({ legal = true, square, piece } = {}) {
    const moves = super._moves({ legal: false, square, piece }).filter(move =>
      this._board[move.to]?.type !== 'k'
      && (!(move.flags & BIG_PAWN) || !this._board[move.from].moved));
    const add = (from, to, flags = NORMAL) => {
      if (to & 0x88) return;
      const mover = this._board[from], target = this._board[to];
      if (target?.color === mover.color || target?.type === 'k') return;
      const move = { from, to, color: mover.color, piece: mover.type,
        captured: target?.type, flags: target ? CAPTURE : flags };
      // Promotion is a pawn rule, regardless of which movement it used.
      if (mover.type === 'p' && to >> 4 === (mover.color === 'w' ? 0 : 7)) {
        for (const promotion of ['n', 'b', 'r', 'q']) {
          moves.push({ ...move, promotion, flags: move.flags | PROMOTION });
        }
      } else moves.push(move);
    };
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const mover = this._board[from];
      if (!mover || mover.color !== this._turn || (square && squareIndex(square.toLowerCase()) !== from)
          || (piece && mover.type !== piece.toLowerCase())) continue;
      for (const ability of mover.abilities ?? []) {
        if (ability === 'p') {
          const forward = mover.color === 'w' ? -16 : 16;
          if (!this._board[from + forward]) add(from, from + forward);
          for (const delta of [forward - 1, forward + 1]) {
            if (this._board[from + delta]) add(from, from + delta);
          }
          continue;
        }
        for (const offset of offsets[ability]) {
          for (let to = from + offset; !(to & 0x88); to += offset) {
            add(from, to);
            if (this._board[to] || ability === 'n') break;
          }
        }
      }
    }
    const destinations = new Map();
    for (const move of moves) {
      const key = move.from + ':' + move.to + ':' + (move.promotion ?? '');
      if (!destinations.has(key)) destinations.set(key, move);
    }
    const unique = [...destinations.values()];
    if (!legal) return unique;
    return unique.filter(move => {
      const color = this._turn;
      this._makeMove(move);
      const allowed = !this._isKingAttacked(color);
      this._undoMove();
      return allowed;
    });
  }

  _makeMove(move) {
    const original = this._board[move.from];
    const capturedSquare = move.flags & EP_CAPTURE ? move.to + (this._turn === 'w' ? 16 : -16) : move.to;
    const captured = this._board[capturedSquare];
    const hash = this._hash;
    super._makeMove(move);
    // Save complete pieces: chess.js's undo normally restores only type and color.
    Object.assign(this._history.at(-1), { original, capturedPiece: captured, capturedSquare, variantHash: hash });
    const moved = this._board[move.to];
    if (!original || !moved) return;
    this._hash ^= this._pieceKey(move.to);
    const abilities = new Set(original.abilities ?? []);
    if (captured && original.type !== 'k') {
      for (const ability of movementAbilities(captured)) abilities.add(ability);
    }
    for (const ability of families(moved.type)) abilities.delete(ability);
    const total = new Set([...families(moved.type), ...abilities]);
    if (total.has('b') && total.has('r')) abilities.delete('p');
    this._board[move.to] = { ...moved,
      abilities: original.type === 'k' ? [] : order.filter(type => abilities.has(type)),
      ...(moved.type === 'p' ? { moved: true } : {}),
    };
    this._hash ^= this._pieceKey(move.to);
  }

  _undoMove() {
    const old = this._history.at(-1);
    const move = super._undoMove();
    if (!move) return null;
    this._board[move.from] = old.original;
    if (old.capturedPiece) this._board[old.capturedSquare] = old.capturedPiece;
    this._hash = old.variantHash;
    return move;
  }

  board() {
    return super.board().map(row => row.map(piece => piece
      ? { ...piece, abilities: [...(this.get(piece.square).abilities ?? [])] } : null));
  }

  positionKey() { return this._hash.toString(); }
  repetitionCounts() { return new Map([...this._positionCount].map(([hash, count]) => [hash.toString(), count])); }

  isInsufficientMaterial() {
    const material = this._board.filter(piece => piece && piece.type !== 'k');
    // Pawn steps add no attacks to a bishop: a lone such bishop still cannot mate.
    if (material.length === 1 && material[0].type === 'b'
        && (material[0].abilities ?? []).every(type => type === 'p')) return true;
    // Other inherited movement can enable mating positions or change bishop colors.
    if (this._board.some(piece => piece?.abilities?.length)) return false;
    return super.isInsufficientMaterial();
  }
}
