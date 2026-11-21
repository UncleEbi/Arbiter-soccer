# Arbiter Sports Analytics

Advanced multi-sport predictive analytics and statistical calibration platform covering **Football (Soccer), Basketball (NBA), Ice Hockey (NHL), and Tennis (ATP)** across the UK, Europe, the Americas, and international tours.

## Key Features & Statistical Architecture

- **Multi-Sport Predictive Models**:
  - **⚽ Football / Soccer**: Bivariate Poisson model with Dixon-Coles (1997) low-scoreline dependency adjustment ($\tau(0,0)=1-\lambda\mu\rho$, $\tau(0,1)=1+\lambda\rho$, $\tau(1,0)=1+\mu\rho$, $\tau(1,1)=1-\rho$), home-pitch advantage, and lineup/absentee modifiers. Generates 1X2, Double Chance (1X, 12, X2), Over/Under totals (1.5, 2.5, 3.5), Both Teams to Score (BTTS), Draw No Bet (DNB), Clean Sheets, Half-Time, and Top Scorelines.
  - **🏀 Basketball (NBA)**: Possession-pace model ($Pace$) combined with offensive ($O_{rtg}$) and defensive ($D_{rtg}$) efficiency ratings per 100 possessions. Win probabilities and point spreads evaluated using continuous Gaussian margin distributions.
  - **🏒 Ice Hockey (NHL)**: 60-minute regulation Poisson model coupled with starting goaltender save percentages and sudden-death overtime & shootout tie-breaker transitions. Puck line (+1.5 / -1.5) and Over/Under totals.
  - **🎾 Tennis (ATP)**: Barnett-Clarke hierarchical Markov chain model calculating game, set, and match win distributions from court-specific (Hard, Clay, Grass) service-hold and break percentages.
- **📡 Live Feeds & Ingestion Pipeline**: Connectors for Football-Data.org (`X-Auth-Token`), API-Football / RapidAPI, TheSportsDB, and an automated high-fidelity simulated in-play stream advancing match clocks and live stats.
- **📈 Dynamic Bayesian Ratings & Form Trends**: Self-learning Dixon-Coles attacking and defensive ratings with Bayesian MAP (Maximum A Posteriori) stochastic gradient parameter updates on every match result, tracking form trends (📈 Improving, 📉 Declining, ➡️ Stable) and historical progression.
- **🎯 Statistical Calibration & Reliability Diagram**: Computes Brier Score, Brier Skill Score, Log-Loss, and Expected Calibration Error (ECE) across 10 probability deciles ($0-10\%, 10-20\%, \dots, 90-100\%$) to verify that model confidence aligns with empirical real-world frequency.
- **📑 Automated Daily Sports Digest & Exporters**: Generates automated morning briefings ranking Top High-Confidence Bankers, Statistical Value Anomalies, and Lineup Absentees. Supports one-click CSV and JSON downloads and direct webhook dispatch to Discord, Slack, or Telegram.
- **Interactive React UI**: Full-featured analytics dashboard running on port 5000 with real-time filtering by sport and country/region.

## Local Setup

### 1. Installation & Testing

```bash
# Install backend dependencies
npm install

# Run complete automated verification test suite
npm test

# Build backend TypeScript
npm run build
```

### 2. Run API Server & Dashboard

```bash
# Start backend on port 5000 (serves both API and production client)
npm start
```

Visit **http://localhost:5000** in your browser to access the interactive web interface.

### 3. Frontend Development (Optional)

```bash
cd client
npm start
```

Starts the React development server on `http://localhost:3001` with proxying to backend on port 5000.

## REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | Health check, API version, and current bankroll |
| `/matches/upcoming` | `GET` | List upcoming matches (filter with `?sport=` and `?country=`) |
| `/matches/predictions` | `GET` | Multi-market predictions for all scheduled fixtures across sports |
| `/matches/:fixtureId/prediction` | `GET` | Detailed match prediction, xG, probabilities, and value analysis |
| `/matches/:fixtureId/odds` | `POST` | Ingest or update market odds for a match |
| `/matches/:fixtureId/live-stats` | `POST` | Update in-play statistics (minute, goals, possession, shots) |
| `/matches/:fixtureId/result` | `POST` | Record match score, update Bayesian team ratings, and record calibration |
| `/api/feed/status` | `GET` | Live feed provider connection status and managed fixtures |
| `/api/feed/sync` | `POST` | Trigger manual sync (`{"provider": "simulation"\|"football-data"\|"api-football"\|"thesportsdb"}`) |
| `/api/feed/config` | `POST` | Update provider API keys dynamically |
| `/ratings/teams` | `GET` | Dynamic Bayesian team ratings and form trends (`?sport=`) |
| `/ratings/teams/:teamName/history` | `GET` | Chronological Bayesian rating adjustments history for a team |
| `/calibration/metrics` | `GET` | Brier Score, ECE %, Log-Loss, and 10-decile reliability diagram |
| `/calibration/records` | `GET` | Historical verified prediction evaluation records |
| `/digest/daily` | `GET` | Automated morning intelligence brief with banker & anomaly picks |
| `/export/csv` | `GET` | Download full predictions dataset as formatted CSV |
| `/export/json` | `GET` | Download full predictions dataset as JSON |
| `/export/webhook` | `POST` | Dispatch daily brief to a Discord/Slack webhook URL |
| `/backtest` | `POST` | Run historical backtesting simulation with Kelly / flat stake strategies |

## Testing

```bash
npm test
```

Verifies:
1. Poisson PMF and Dixon-Coles non-negativity factors
2. Full multi-market predictions (1X2, DC, Totals, BTTS, DNB)
3. In-play live stats decay adjustments
4. Value betting, EV, and fractional Kelly calculations
5. Bankroll journal tracking and drawdown computation
6. Historical backtesting simulation engine
7. Live HTTP endpoints (Health, Fixtures, Odds, Live Stats, Results, Feeds, Ratings, Calibration, Digest, CSV/JSON Export)

## License

ISC
