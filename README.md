# Ability Chess

A chess variant based on [Opening Shuffle](https://github.com/yigitefeoktar/opening-shuffle). Every game starts from the standard chess position. Capture a piece to inherit all movement abilities it has, including inherited abilities. Small piece icons above the original piece show its additional movement. The king never gains abilities.

Movement is combined without duplicates: queen movement covers bishop and rook movement, and already includes all ordinary pawn moves. Only knight movement jumps over blockers. Inherited pawn movement follows the moving side’s direction: one square forward into an empty square or one square diagonally forward to capture.

All other rules remain standard. Only pawns can double-step, capture en passant, and promote; those special rules do not transfer to other pieces. Enhanced pawns still promote on reaching their final rank and retain inherited movement. Castling is limited to the original king and rooks, subject to normal movement and check restrictions. Check, checkmate, stalemate, repetition, and move-count draw rules account for inherited abilities.

Play against one of five bot levels (Easy, Medium, Hard, Expert, and Impossible) or a friend on the same device. Each game is independent, with no series score or automatic color swap. Games stay only in memory: reloading starts fresh, and the app neither saves nor restores matches.

The app is buildless static HTML, CSS, and JavaScript in `dist/`. Serve with `python -m http.server 8765 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:8765.

Run `node --test tools/verify-game.mjs tools/verify-abilities.mjs tools/verify-bot.mjs tools/verify-motion.mjs tools/verify-rendering.mjs` to check the original chess rules, inherited movement, special moves, bot behavior, and animations. The original opening pool and generator are retained as base-project resources; the game always starts from the normal starting position.

`dist/ability-chess.js` extends the vendored chess.js engine without changing vendor code. Piece and engine licenses remain alongside their respective assets.

AI levels use increasing depth, time budgets, and capture-sequence search. Impossible uses the strongest search, with up to six seconds per move in a Web Worker; it is a difficulty name, not a guarantee of unbeatable play. The engine evaluates inherited movement and uses move ordering without changing the game rules.

Pieces slide between squares on player and bot moves, including both pieces when castling. Captures fade out, and promotion or inherited ability icons appear on arrival. The app respects reduced-motion preferences. Checkmate leaves the final board visible for three seconds after the move, highlighting the king and checking pieces with a short explanation. Choose Keep reviewing to stay on the board, or View results to continue.

Board rendering preserves piece and image elements. Moves relocate and animate the actual elements; unchanged squares are never emptied or rebuilt. Ability badges and promotions update on arrival without swapping a cloned piece into place.
