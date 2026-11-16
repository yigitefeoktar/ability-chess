# Opening Shuffle

Play standard chess from an engine-screened opening against a bot or another person on the same device. After the first game, replay the identical position with the colors swapped. Shuffle draws a different opening and starts a new match.

Serve the static app from the project directory with `python -m http.server 8765 --bind 127.0.0.1 --directory dist`, then open http://127.0.0.1:8765. The app uses no server-side game logic.

The opening pool was generated with Stockfish 19. The generator samples legal, capture-free lines from the standard starting board and checks the resulting position and the position after Stockfish's top continuation. The best line at each check must stay close to even, and each side needs at least three viable moves at its check. The engine scores are estimates.

To regenerate the pool, run `node tools/generate-openings.mjs path/to/stockfish`. Set `OPENING_COUNT` to change the target pool size.
