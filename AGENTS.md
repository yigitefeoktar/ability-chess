# Ability Chess deployment

- Source of truth: `https://github.com/yigitefeoktar/ability-chess.git`, branch `main`, remote `origin`. This is independent of Opening Shuffle; never push Ability Chess changes to that game's repository or Vercel project.
- `sites-source` retains the original private Sites source as historical provenance. The migrated published source was `f32326b8a19618d1666398863b07b7c2ee89303e`. Do not push to Sites during GitHub/Vercel releases.
- Deployment manifest: `deployment.json`. Vercel project `ability-chess` under `yigits-projects-96bf526b`; stable public production URL: https://ability-chess.vercel.app/.
- Buildless frontend: `vercel.json` publishes checked-in static HTML, CSS, JavaScript, pieces and fonts in `dist/`. No install/build command is required.
- Before release inspect Git status/remotes, preserve unrelated work, fetch/reconcile `origin/main`, run `node --test tools/verify-game.mjs tools/verify-abilities.mjs tools/verify-bot.mjs tools/verify-motion.mjs tools/verify-rendering.mjs tools/verify-move-choices.mjs` and `git diff --check`.
- Commit only task files to `main` and push without force. Main pushes trigger Vercel. Verify the exact main SHA's successful Vercel deployment, public stable URL, a capture that inherits movement, bot worker, a fresh game after reload and mobile layout.
- Do not start a local development server unless requested; a bounded production smoke test is appropriate.
- Backend is explicitly disabled (`backend: null`). Two-player mode is local to one device. No backend install/start/exposure, Windows tasks, ports or tunnels.
- Free services only. Google Cloud billing and automatic game triggers remain disabled. Preserve historical resources and never reuse another game's infrastructure.
- Recovery: restore a verified prior Vercel deployment if needed, then fix/revert only the faulty task on `main` and push normally. If Instant Rollback pauses domain assignment, promote the corrected production deployment.
