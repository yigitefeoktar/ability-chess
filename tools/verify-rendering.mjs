import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateSquarePiece } from '../dist/piece-view.js';
import { createMoveAnimator } from '../dist/motion.js';

// A small DOM fixture keeps these identity/lifecycle regressions runnable with
// plain Node. Full application interaction is also checked separately in a DOM.
class Element {
  constructor(tag, document) {
    this.tag = tag; this.ownerDocument = document; this.children = [];
    this.dataset = {}; this.style = {}; this.attributes = {}; this.classes = new Set();
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name), contains: name => this.classes.has(name) };
  }
  set className(value) { this.classes = new Set(value.split(' ')); }
  get className() { return [...this.classes].join(' '); }
  set src(value) { this.attributes.src = value; this.sourceWrites = (this.sourceWrites ?? 0) + 1; }
  get src() { return this.attributes.src; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  append(child) { child.remove(); child.parentNode = this; this.children.push(child); }
  remove() {
    if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  querySelector(selector) {
    const matches = node => selector === 'img' ? node.tag === 'img'
      : selector === '.piece:not(.motion-victim)' ? node.classes.has('piece') && !node.classes.has('motion-victim')
      : node.classes.has(selector.slice(1));
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  getBoundingClientRect() { return this.rect; }
}

function fixture(names, reduced = false) {
  const animations = [];
  const document = { createElement: tag => {
    const node = new Element(tag, document);
    node.animate = (frames, options) => {
      let finish, reject;
      const animation = { frames, options, element: node, finished: new Promise((yes, no) => { finish = yes; reject = no; }),
        finish: () => finish(), cancel: () => { animation.cancelled = true; reject(new Error('cancelled')); } };
      animations.push(animation);
      return animation;
    };
    return node;
  } };
  const squares = new Map(names.map(name => {
    const node = document.createElement('button');
    node.rect = { left: (name.charCodeAt(0) - 97) * 60, top: (8 - Number(name[1])) * 60 };
    return [name, node];
  }));
  return { squares, animations, animator: createMoveAnimator(squares, () => reduced) };
}

test('moves and repeated renders retain the same piece and image, without hiding or reloading them', async () => {
  const { squares, animations, animator } = fixture(['e2', 'e4', 'a1']);
  const pawn = { color: 'w', type: 'p' };
  const original = updateSquarePiece(squares.get('e2'), pawn);
  const image = original.querySelector('img');
  const untouched = updateSquarePiece(squares.get('a1'), { color: 'w', type: 'r' });
  for (let i = 0; i < 4; i++) assert.equal(updateSquarePiece(squares.get('e2'), pawn), original);
  const before = animator.snapshot();
  assert.equal(before.get('e2').piece, original);
  const move = { from: 'e2', to: 'e4', flags: 'b' };
  animator.place(move, before);
  updateSquarePiece(squares.get('e2'), undefined);
  updateSquarePiece(squares.get('e4'), pawn, { deferAppearance: true });
  const playing = animator.play(move, before);
  assert.equal(animations[0].element, original);
  assert.equal(original.style.visibility, undefined);
  animations.forEach(animation => animation.finish());
  await playing;
  updateSquarePiece(squares.get('e4'), pawn);
  assert.equal(squares.get('e4').querySelector('.piece'), original);
  assert.equal(original.querySelector('img'), image);
  assert.equal(image.sourceWrites, 1);
  assert.equal(squares.get('a1').querySelector('.piece'), untouched);
});

test('capture slides the original piece and applies inherited icons only on arrival', async () => {
  const { squares, animations, animator } = fixture(['g1', 'e2']);
  const knight = updateSquarePiece(squares.get('g1'), { color: 'w', type: 'n' });
  const victim = updateSquarePiece(squares.get('e2'), { color: 'b', type: 'q' });
  const image = knight.querySelector('img');
  const before = animator.snapshot();
  const move = { from: 'g1', to: 'e2', flags: 'c', captured: 'q' };
  animator.place(move, before);
  const enhanced = { color: 'w', type: 'n', abilities: ['b', 'r'] };
  updateSquarePiece(squares.get('e2'), enhanced, { deferAppearance: true });
  const playing = animator.play(move, before);
  assert.equal(squares.get('e2').querySelector('.motion-piece'), knight);
  assert.equal(squares.get('e2').querySelector('.motion-victim'), victim);
  assert.equal(knight.querySelector('.ability-badges'), null);
  animations[0].finish();
  for (let i = 0; i < 4; i++) await Promise.resolve();
  assert.equal(animations[0].cancelled, undefined, 'the faded victim must not flash back during the remaining slide');
  animations.forEach(animation => animation.finish());
  await playing;
  updateSquarePiece(squares.get('e2'), enhanced);
  assert.equal(victim.parentNode, null);
  assert.equal(knight.querySelector('img'), image);
  assert.match(knight.querySelector('.ability-badges').querySelector('img').src, /wQ.png/);
});

test('castling retains both actual piece elements and cancellation leaves a complete board', async () => {
  const { squares, animator } = fixture(['e1', 'g1', 'h1', 'f1']);
  const king = updateSquarePiece(squares.get('e1'), { color: 'w', type: 'k' });
  const rook = updateSquarePiece(squares.get('h1'), { color: 'w', type: 'r' });
  const move = { from: 'e1', to: 'g1', flags: 'k' };
  const before = animator.snapshot();
  animator.place(move, before);
  const playing = animator.play(move, before);
  animator.cancel();
  await playing;
  assert.equal(squares.get('g1').querySelector('.piece'), king);
  assert.equal(squares.get('f1').querySelector('.piece'), rook);
  assert.equal(king.classList.contains('motion-piece'), false);
  assert.equal(rook.classList.contains('motion-piece'), false);
});

test('reduced motion and promotion keep the same visible piece element', async () => {
  const { squares, animations, animator } = fixture(['a7', 'a8'], true);
  const pawn = updateSquarePiece(squares.get('a7'), { color: 'w', type: 'p' });
  const image = pawn.querySelector('img');
  const move = { from: 'a7', to: 'a8', flags: 'np', promotion: 'q' };
  const before = animator.snapshot();
  animator.place(move, before);
  updateSquarePiece(squares.get('a8'), { color: 'w', type: 'q' }, { deferAppearance: true });
  await animator.play(move, before);
  updateSquarePiece(squares.get('a8'), { color: 'w', type: 'q' });
  assert.equal(animations.length, 0);
  assert.equal(squares.get('a8').querySelector('.piece'), pawn);
  assert.equal(pawn.querySelector('img'), image);
  assert.match(image.src, /wQ.png/);
});
