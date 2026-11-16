# Opening Shuffle deployment

- Use `main` on `origin` at https://github.com/yigitefeoktar/opening-shuffle.git for releases. Fetch and reconcile upstream changes before pushing.
- Vercel project `opening-shuffle` serves https://opening-shuffle.vercel.app/ from GitHub `main`. `vercel.json` publishes the checked-in static files in `dist/`. There is no install or build command.
- Run `node --test tools/verify-game.mjs` before pushing. After `git push origin main`, verify that Vercel reports a ready production deployment for the pushed SHA. Open the production URL and make a move to verify the frontend and bot worker.
- To recover a bad release, use Vercel Instant Rollback to restore a known-good production deployment, revert the faulty commit on `main`, and deploy the corrected commit. Promote the corrected deployment if automatic alias assignment is paused after rollback.
- Multiplayer is local to one device. No backend is enabled. Keep production on the free Vercel plan.
- Google Cloud billing and the old automatic game triggers are disabled. Use GitHub and Vercel for releases.
