// Backtesting Simulation Engine for Model Validation & Strategy Optimization

import { predictPoissonDC, TeamRatings } from './model';
import { identifyValueBets } from './valueBetting';

export interface HistoricalMatchSample {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  odds: {
    home: number;
    draw: number;
    away: number;
  };
}

// Built-in benchmark test suite of historical matches with closing market odds
// Allows testing model calibration, edge identification, and drawdown without needing an external API key.
export const SAMPLE_HISTORICAL_MATCHES: HistoricalMatchSample[] = [
  { fixtureId: 101, homeTeam: 'Arsenal', awayTeam: 'Chelsea', homeGoals: 5, awayGoals: 0, odds: { home: 1.55, draw: 4.50, away: 5.75 } },
  { fixtureId: 102, homeTeam: 'Manchester City', awayTeam: 'Aston Villa', homeGoals: 4, awayGoals: 1, odds: { home: 1.28, draw: 6.20, away: 9.50 } },
  { fixtureId: 103, homeTeam: 'Liverpool', awayTeam: 'Tottenham', homeGoals: 4, awayGoals: 2, odds: { home: 1.48, draw: 5.20, away: 5.60 } },
  { fixtureId: 104, homeTeam: 'Real Madrid', awayTeam: 'Barcelona', homeGoals: 3, awayGoals: 2, odds: { home: 1.88, draw: 4.00, away: 3.80 } },
  { fixtureId: 105, homeTeam: 'Manchester United', awayTeam: 'Newcastle', homeGoals: 3, awayGoals: 2, odds: { home: 2.70, draw: 3.90, away: 2.45 } },
  { fixtureId: 106, homeTeam: 'Chelsea', awayTeam: 'Tottenham', homeGoals: 2, awayGoals: 0, odds: { home: 2.25, draw: 4.10, away: 2.85 } },
  { fixtureId: 107, homeTeam: 'Brighton', awayTeam: 'Manchester City', homeGoals: 0, awayGoals: 4, odds: { home: 6.50, draw: 5.00, away: 1.45 } },
  { fixtureId: 108, homeTeam: 'Aston Villa', awayTeam: 'Liverpool', homeGoals: 3, awayGoals: 3, odds: { home: 3.90, draw: 4.50, away: 1.78 } },
  { fixtureId: 109, homeTeam: 'West Ham', awayTeam: 'Liverpool', homeGoals: 2, awayGoals: 2, odds: { home: 5.20, draw: 4.60, away: 1.58 } },
  { fixtureId: 110, homeTeam: 'Fulham', awayTeam: 'Manchester City', homeGoals: 0, awayGoals: 4, odds: { home: 11.00, draw: 6.50, away: 1.25 } },
  { fixtureId: 111, homeTeam: 'Tottenham', awayTeam: 'Manchester City', homeGoals: 0, awayGoals: 2, odds: { home: 6.00, draw: 5.50, away: 1.42 } },
  { fixtureId: 112, homeTeam: 'Arsenal', awayTeam: 'Everton', homeGoals: 2, awayGoals: 1, odds: { home: 1.18, draw: 7.50, away: 15.00 } },
  { fixtureId: 113, homeTeam: 'Manchester City', awayTeam: 'West Ham', homeGoals: 3, awayGoals: 1, odds: { home: 1.10, draw: 11.00, away: 23.00 } },
  { fixtureId: 114, homeTeam: 'Liverpool', awayTeam: 'Wolves', homeGoals: 2, awayGoals: 0, odds: { home: 1.16, draw: 8.50, away: 15.00 } },
  { fixtureId: 115, homeTeam: 'Brighton', awayTeam: 'Manchester United', homeGoals: 0, awayGoals: 2, odds: { home: 2.15, draw: 4.00, away: 3.10 } },
  { fixtureId: 116, homeTeam: 'Chelsea', awayTeam: 'Bournemouth', homeGoals: 2, awayGoals: 1, odds: { home: 1.45, draw: 5.25, away: 6.00 } },
  { fixtureId: 117, homeTeam: 'Crystal Palace', awayTeam: 'Aston Villa', homeGoals: 5, awayGoals: 0, odds: { home: 1.80, draw: 4.20, away: 4.10 } },
  { fixtureId: 118, homeTeam: 'Sheffield United', awayTeam: 'Tottenham', homeGoals: 0, awayGoals: 3, odds: { home: 7.50, draw: 6.00, away: 1.34 } },
  { fixtureId: 119, homeTeam: 'Burnley', awayTeam: 'Nottingham Forest', homeGoals: 1, awayGoals: 2, odds: { home: 3.40, draw: 3.80, away: 2.10 } },
  { fixtureId: 120, homeTeam: 'Luton', awayTeam: 'Fulham', homeGoals: 2, awayGoals: 4, odds: { home: 3.00, draw: 3.80, away: 2.28 } },
];

export interface BacktestOptions {
  strategy?: 'half-kelly' | 'full-kelly' | 'quarter-kelly' | 'flat-stake';
  flatStakePercent?: number; // e.g. 2%
  initialBankroll?: number;
  minEdgePercent?: number;
  minEv?: number;
  maxStakePercent?: number;
  matches?: HistoricalMatchSample[];
}

export interface BacktestBetResult {
  fixtureId: number;
  match: string;
  chosenOutcome: string;
  actualResult: 'Home Win' | 'Draw' | 'Away Win';
  score: string;
  modelProb: number;
  odds: number;
  edgePercent: number;
  expectedValue: number;
  stake: number;
  won: boolean;
  pnl: number;
  bankrollAfter: number;
}

export interface BacktestResult {
  initialBankroll: number;
  finalBankroll: number;
  netProfit: number;
  roiPercent: number;
  totalMatchesAnalyzed: number;
  betsPlaced: number;
  betsWon: number;
  betsLost: number;
  winRate: number;
  maxDrawdownPercent: number;
  maxDrawdownAmount: number;
  brierScore: number;
  strategyUsed: string;
  equityCurve: Array<{ step: number; bankroll: number; pnl: number }>;
  bets: BacktestBetResult[];
}

export function runBacktest(
  options: BacktestOptions = {},
  teamRatings?: Map<string, TeamRatings>
): BacktestResult {
  const strategy = options.strategy || 'half-kelly';
  const initialBankroll = options.initialBankroll ?? 1000;
  const flatStakePercent = (options.flatStakePercent ?? 2.5) / 100;
  const minEdge = (options.minEdgePercent ?? 1.5) / 100;
  const minEv = options.minEv ?? 0.015;
  const maxStakePct = (options.maxStakePercent ?? 5.0) / 100;

  const dataset = options.matches && options.matches.length > 0 ? options.matches : SAMPLE_HISTORICAL_MATCHES;

  let currentBankroll = initialBankroll;
  let peak = initialBankroll;
  let maxDrawdownAmount = 0;
  let maxDrawdownPercent = 0;
  let totalStaked = 0;
  let brierSum = 0;

  const bets: BacktestBetResult[] = [];
  const equityCurve: Array<{ step: number; bankroll: number; pnl: number }> = [
    { step: 0, bankroll: initialBankroll, pnl: 0 },
  ];

  for (const match of dataset) {
    const prediction = predictPoissonDC(match.homeTeam, match.awayTeam, teamRatings);
    const valueAnalysis = identifyValueBets(prediction.outcomeProbabilities, match.odds, currentBankroll);

    if (!valueAnalysis || !valueAnalysis.hasValue) {
      continue;
    }

    // Determine actual match outcome
    let actualOutcome: 'Home Win' | 'Draw' | 'Away Win';
    if (match.homeGoals > match.awayGoals) {
      actualOutcome = 'Home Win';
    } else if (match.homeGoals < match.awayGoals) {
      actualOutcome = 'Away Win';
    } else {
      actualOutcome = 'Draw';
    }

    // Filter value bets meeting minimum edge and EV thresholds
    const actionableBets = valueAnalysis.valueBets.filter(
      (vb) => vb.expectedValue >= minEv && vb.edgePercent / 100 >= minEdge
    );

    if (actionableBets.length === 0) {
      continue;
    }

    // Take the best edge/EV bet for this match
    const bestBet = actionableBets[0];

    // Determine stake based on strategy
    let stakePct = 0;
    if (strategy === 'full-kelly') {
      stakePct = Math.min(bestBet.kellyFraction / 100, maxStakePct);
    } else if (strategy === 'half-kelly') {
      stakePct = Math.min(bestBet.kellyHalfFraction / 100, maxStakePct);
    } else if (strategy === 'quarter-kelly') {
      stakePct = Math.min(bestBet.kellyQuarterFraction / 100, maxStakePct);
    } else {
      stakePct = flatStakePercent;
    }

    if (stakePct <= 0) continue;

    const stake = parseFloat(Math.max(1, currentBankroll * stakePct).toFixed(2));
    if (stake > currentBankroll) continue;

    const won = bestBet.outcome === actualOutcome;
    const pnl = won ? parseFloat((stake * (bestBet.odds - 1)).toFixed(2)) : -stake;

    currentBankroll = parseFloat((currentBankroll + pnl).toFixed(2));
    totalStaked += stake;

    // Calibration calculation (Brier Score)
    const outcomeBinary = won ? 1 : 0;
    brierSum += Math.pow(bestBet.modelProbability / 100 - outcomeBinary, 2);

    if (currentBankroll > peak) {
      peak = currentBankroll;
    }
    const ddAmount = peak - currentBankroll;
    const ddPct = peak > 0 ? (ddAmount / peak) * 100 : 0;
    if (ddAmount > maxDrawdownAmount) maxDrawdownAmount = ddAmount;
    if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

    bets.push({
      fixtureId: match.fixtureId,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      chosenOutcome: bestBet.outcome,
      actualResult: actualOutcome,
      score: `${match.homeGoals}-${match.awayGoals}`,
      modelProb: bestBet.modelProbability,
      odds: bestBet.odds,
      edgePercent: bestBet.edgePercent,
      expectedValue: bestBet.expectedValue,
      stake,
      won,
      pnl,
      bankrollAfter: currentBankroll,
    });

    equityCurve.push({
      step: bets.length,
      bankroll: currentBankroll,
      pnl,
    });
  }

  const wonBets = bets.filter((b) => b.won).length;
  const lostBets = bets.length - wonBets;
  const netProfit = parseFloat((currentBankroll - initialBankroll).toFixed(2));
  const roiPercent = totalStaked > 0 ? parseFloat(((netProfit / totalStaked) * 100).toFixed(2)) : 0;
  const winRate = bets.length > 0 ? parseFloat(((wonBets / bets.length) * 100).toFixed(2)) : 0;
  const brierScore = bets.length > 0 ? parseFloat((brierSum / bets.length).toFixed(4)) : 0;

  return {
    initialBankroll,
    finalBankroll: currentBankroll,
    netProfit,
    roiPercent,
    totalMatchesAnalyzed: dataset.length,
    betsPlaced: bets.length,
    betsWon: wonBets,
    betsLost: lostBets,
    winRate,
    maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
    maxDrawdownAmount: parseFloat(maxDrawdownAmount.toFixed(2)),
    brierScore,
    strategyUsed: strategy,
    equityCurve,
    bets,
  };
}
