import { abilityBadges } from './ability-chess.js';

export function pieceImage(color, type, document = globalThis.document) {
  const image = document.createElement('img');
  image.src = './pieces/' + color + type.toUpperCase() + '.png';
  image.alt = '';
  return image;
}

// Keep the same piece and image nodes across renders. During a slide, retain
// the pre-capture/promotion appearance until the piece reaches its destination.
export function updateSquarePiece(button, piece, { draggable = false, deferAppearance = false } = {}) {
  let visual = button.querySelector('.piece:not(.motion-victim)');
  if (!piece) {
    visual?.remove();
    return;
  }
  const existing = Boolean(visual);
  if (!visual) {
    visual = button.ownerDocument.createElement('span');
    visual.className = 'piece';
    button.append(visual);
  }
  const badges = abilityBadges(piece);
  const signature = piece.color + piece.type + ':' + badges.join('');
  if ((!deferAppearance || !existing) && visual.dataset.piece !== signature) {
    let image = visual.querySelector('img');
    const path = './pieces/' + piece.color + piece.type.toUpperCase() + '.png';
    if (!image) {
      image = pieceImage(piece.color, piece.type, button.ownerDocument);
      visual.append(image);
    } else if (image.getAttribute('src') !== path) image.src = path;
    visual.querySelector('.ability-badges')?.remove();
    if (badges.length) {
      const overlay = button.ownerDocument.createElement('span');
      overlay.className = 'ability-badges';
      overlay.setAttribute('aria-hidden', 'true');
      for (const type of badges) {
        const badge = pieceImage(piece.color, type, button.ownerDocument);
        badge.draggable = false;
        overlay.append(badge);
      }
      visual.append(overlay);
    }
    visual.dataset.piece = signature;
  }
  visual.querySelector('img').draggable = draggable;
  return visual;
}
