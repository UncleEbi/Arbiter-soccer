# AGENTS.md

This file is the human-readable equivalent of the conversation summary and is
a useful reference for future agents. It should be kept concise and current.

## Project intent

Sports prediction app focused on consistent profitability through value identification using a Poisson + Dixon-Coles model and Kelly-criterion staking. The original ask included a 99% winning rate, which was treated as infeasible; the practical goal is calibrated probabilities plus value-bet detection.

## What is here

- `src/index.ts`: Express + TypeScript API. Prediction via Poisson + Dixon-Coles. Adds value betting helpers:
  - `oddsToImpliedProb`, `calculateEV`, `calculateKellyFraction`, `identifyValueBets`
  - Outputs model probability, implied probability, edge, EV, full/half Kelly, recommended stake
  - Confidence bands: Low / Medium / High from EV thresholds
- `dist/index.js`: compiled output
- `client/`: React frontend (in progress; not needed for API verification)
- `package.json`: commonjs, `build` and `start` scripts, deps on express/axios/cors
- `tsconfig.json`: compiles `src` to `dist`, includes types for node/express/axios/cors

## Verified commands

- `npm install` (needs dependencies; install in workspace before build/start)
- `npm run build` -> `tsc` (should exit 0)
- `npm start` starts the API on port 3000 by default (`PORT` env can override)

## Main API surface

- `GET /health`
- `GET /matches/upcoming`
- `GET /matches/:fixtureId/prediction`
- `POST /matches/:fixtureId/result`
- `POST /matches/:fixtureId/live-stats`

Prediction endpoints use the model and can return `prediction` with expected goals, outcome probabilities, and top scorelines. The value-betting helpers are primarily used to compare model probabilities against odds when they are provided.

## Outstanding items

- Server must be started before live-stats and other endpoints can be verified via HTTP. In this workspace, background server may need to be restarted before a batch of curl checks.
- Odds ingestion: the value-betting path is wired conceptually, but a real odds feed or manual odds input needs a concrete endpoint or data path before the system can recommend stakes end-to-end.
- Backtesting/journaling for bankroll growth, calibration, and drawdown is not yet implemented.

## Important notes for agent sessions

- Prefer targeted edits over rewriting whole files.
- Before claiming the API works, start the server and hit real endpoints; build success alone is not enough.
- If you add runtime-only dependencies or scripts, keep them local to this repo unless the user asks otherwise.
- Do not assume shell backgrounding survives tool cleanup; when you need a long-running server, start it in a way that stays alive for the duration of the checks you need.
