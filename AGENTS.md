# AGENTS.md

This file is the human-readable equivalent of the conversation summary and is
a useful reference for future agents. It should be kept concise and current.

## Project intent

Sports prediction app focused on consistent profitability through value identification using a Poisson + Dixon-Coles model and Kelly-criterion staking. The original ask included a 99% winning rate, which was treated as infeasible; the practical goal is calibrated probabilities plus value-bet detection.

## What is here

- `src/model.ts`: Multi-sport statistical prediction models:
  - Soccer: Bivariate Poisson + Dixon-Coles (1997) with non-negative tau adjustments and multi-market calculations (1X2, DC, Totals, BTTS, DNB, Clean Sheets, HT, exact scores).
  - Basketball (NBA): Possession pace and offensive/defensive rating differential evaluated via normal CDF for Spreads and Totals.
  - Ice Hockey (NHL): 60-min regulation Poisson coupled with overtime tiebreaker progression + Puck line (+/- 1.5) + Totals.
  - Tennis (ATP): Barnett-Clarke hierarchical Markov chain hold/break model for match winner, set betting (2-0, 2-1), and game totals.
- `src/liveIngestion.ts`: Live External Feeds & Ingestion Pipeline:
  - Connectors for Football-Data.org, API-Football / RapidAPI, TheSportsDB, and Simulated In-Play Stream Generator.
  - Endpoints: `GET /api/feed/status`, `POST /api/feed/sync`, `POST /api/feed/config`.
- `src/dynamicRatings.ts`: Dynamic Bayesian Rating Engine with Time-Decay & Stochastic Gradient Updating:
  - Dixon-Coles attack/defence ratings with Bayesian MAP stochastic gradient parameter updates on post-match result.
  - Tracks rating progression history and form trends (improving/declining/stable) for 39+ teams across sports.
  - Endpoints: `GET /ratings/teams`, `GET /ratings/teams/:team/history`.
- `src/calibration.ts`: Model Calibration & Statistical Reliability Engine:
  - Calculates Brier Score, Brier Skill Score, Expected Calibration Error (ECE %), Max Calibration Error (MCE %), Log-Loss, and 10-decile Reliability Curve bins.
  - Endpoints: `GET /calibration/metrics`, `GET /calibration/records`, `POST /calibration/record`.
- `src/exportAndDigest.ts`: Daily Intelligence Digest, Statistical Ranking, CSV/JSON Exporters & Webhook Dispatcher:
  - Automated morning brief ranking Top High-Confidence Bankers, Value / Edge Anomalies, and Lineup Absentees.
  - Endpoints: `GET /digest/daily`, `GET /export/csv`, `GET /export/json`, `POST /export/webhook`.
- `src/valueBetting.ts`: Value betting & Kelly criterion staking:
  - `oddsToImpliedProb`, `calculateEV`, `calculateKellyFraction`, `evaluateSingleBet`, `identifyValueBets`
  - Half-Kelly (default risk-balanced), full-Kelly, and quarter-Kelly staking.
  - Confidence bands (High / Medium / Low) based on EV thresholds and edge percentage.
- `src/journal.ts`: Bankroll Journal & Bet Performance Tracking:
  - `BankrollJournal`: places bets, tracks pending stakes, settles outcomes (`won`, `lost`, `void`).
  - Metrics: Current Bankroll, Net Profit, ROI %, Win Rate %, Max Drawdown ($ and %), Brier calibration score ($BS = \frac{1}{N}\sum(p - y)^2$), and equity curve.
- `src/backtest.ts`: Backtesting simulation engine:
  - Benchmark test suite of historical matches with closing market odds.
  - Supports `half-kelly`, `full-kelly`, `quarter-kelly`, and `flat-stake` strategies.
  - Computes final bankroll, peak, max drawdown %, ROI %, and equity curve.
- `src/index.ts`: Express + TypeScript API server exposing all endpoints.
- `src/test.ts`: Complete automated verification test suite.
- `client/`: React frontend with full interactive UI for predictions, odds editing, value bet scanning, 1-click bet placement, bankroll journal, backtest simulation, live feeds, Bayesian ratings, and calibration dashboard.
- `dist/`: Compiled output from TypeScript.

## Verified commands

- `npm install` (installs backend dependencies)
- `npm run build` -> `tsc -p tsconfig.json` (exits 0)
- `npm test` -> `tsc -p tsconfig.json && node dist/test.js` (runs all unit and live HTTP tests, exits 0)
- `npm start` -> `node dist/index.js` (starts the API on port 3000 or `PORT` env)
- `cd client && npm run build` -> builds client production bundle cleanly with zero warnings

## Main API surface

- `GET /health` - API status, version, and current bankroll
- `GET /matches/upcoming` - List upcoming and in-play fixtures with current market odds
- `GET /matches/:fixtureId/prediction` - Poisson + Dixon-Coles prediction, expected goals, outcome probabilities, top scorelines, and value bet analysis (supports query params `homeOdds`, `drawOdds`, `awayOdds`, `bankroll`)
- `POST /matches/:fixtureId/odds` - Ingest / update market odds for a match
- `GET /matches/value-bets` - Scan all matches and return all value betting opportunities ranked by EV
- `POST /matches/:fixtureId/live-stats` - Submit in-play match statistics (possession, shots, goals, minute) and receive updated live prediction
- `POST /matches/:fixtureId/result` - Record final match score, auto-settle any pending bets on this fixture, and update bankroll
- `GET /bets` - List all bets in the journal (filter by `status` or `fixtureId`)
- `POST /bets` - Record a placed bet (fixtureId, match, outcome, odds, stake, EV)
- `POST /bets/:id/settle` - Manually settle a bet (`won`, `lost`, `void`)
- `GET /journal/stats` - Bankroll summary, ROI, win rate, max drawdown, and Brier calibration score
- `POST /backtest` - Run backtesting simulation across historical matches with Kelly / flat stake strategies

## Notes for future agent sessions

- Prefer targeted edits over rewriting whole files.
- Before claiming the API works, start the server and hit real endpoints; `npm test` validates all endpoints end-to-end.
- The backend and frontend are synchronized: predictions provide both nested properties (`outcomeProbabilities`) and flat properties (`homeWinProbability`, `drawProbability`, `awayWinProbability`, `predictedWinner`) for seamless client compatibility.
