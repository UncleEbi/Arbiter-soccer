# Arbiter Soccer

Football prediction with value-bet identification using a Poisson + Dixon-Coles model and Kelly-criterion staking.

## What it does

- Predicts match outcomes using a Poisson + Dixon-Coles model.
- Computes expected goals, outcome probabilities, and top scorelines.
- Identifies value bets by comparing model probabilities against market odds.
- Recommends stakes using full and half-Kelly staking with configurable bankroll.
- Exposes a simple REST API for matches, predictions, live stats, and results.

## Project status

This is a working backend with a basic React frontend shell. It is not a paid prediction service and it does not claim a fixed win rate. Realistic accuracy is lower than marketing hype; the goal here is calibrated probabilities and value identification, not guarantees.

## Local setup

```bash
npm install
npm run build
npm start
```

The API starts on port 3000 by default. Set `PORT` to override it. Set `API_FOOTBALL_KEY` if you want the historical-data path wired to API-Football.

## API

- `GET /health`
- `GET /matches/upcoming`
- `GET /matches/:fixtureId/prediction`
- `POST /matches/:fixtureId/result`
- `POST /matches/:fixtureId/live-stats`

Prediction responses include `expectedGoals`, `outcomeProbabilities`, and `topScorelines`.

## Value betting

Value-bet identification lives in the prediction path and uses:
- implied probability from decimal odds
- expected value per outcome
- Kelly fraction and half-Kelly fraction
- confidence bands based on EV thresholds

It is designed to compare model probability against odds when odds are provided.

## Limitations

- No real odds feed is included by default.
- Team ratings are currently based on default values or on API-Football historical data when available.
- Dixon-Coles uses a fixed rho; production use would tune it per league.
- This is not financial or betting advice.

## License

ISC
