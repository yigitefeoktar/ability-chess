const coordinate = square => 'abcdefgh'[square & 7] + '87654321'[square >> 4];

// UI targets and worker messages need coordinates, not SAN. Avoid generating
// speculative notation (and checking every candidate again) just to draw dots.
export function legalMoveChoices(game, square) {
  return game._moves({ square }).map(move => ({
    from: coordinate(move.from),
    to: coordinate(move.to),
    promotion: move.promotion,
    captured: move.captured,
    lan: coordinate(move.from) + coordinate(move.to) + (move.promotion ?? ''),
  }));
}
