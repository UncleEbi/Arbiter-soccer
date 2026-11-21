// Value Betting & Kelly Staking Engine

import { OutcomeProbabilities } from './model';

export interface MarketOdds {
  home: number;
  draw: number;
  away: number;
  over25?: number;
  under25?: number;
  bttsYes?: number;
  bttsNo?: number;
  bookmaker?: string;
  lastUpdated?: string;
}

export interface ValueBet {
  market: '1X2' | 'Totals' | 'BTTS';
  outcome: string;
  modelProbability: number;
  odds: number;
  impliedProbability: number;
  edgePercent: number;
  expectedValue: number;
  kellyFraction: number;
  kellyHalfFraction: number;
  kellyQuarterFraction: number;
  isValueBet: boolean;
  confidence: 'High' | 'Medium' | 'Low' | 'None';
  recommendedStake: number;
  recommendedStakePercent: number;
}

export interface ValueBetAnalysis {
  valueBets: ValueBet[];
  bestValueBet: ValueBet | null;
  hasValue: boolean;
  summary: {
    totalEvaluated: number;
    valueOpportunitiesFound: number;
    bankroll: number;
  };
}

export function oddsToImpliedProb(odds: number): number {
  if (odds <= 1.0) return 1.0;
  return 1 / odds;
}

export function calculateEV(modelProb: number, odds: number): number {
  if (odds <= 1.0 || modelProb <= 0) return -1;
  // EV = (prob * (odds - 1)) - ((1 - prob) * 1) = prob * odds - 1
  return modelProb * odds - 1;
}

export function calculateKellyFraction(modelProb: number, odds: number): number {
  if (odds <= 1.0 || modelProb <= 0) return 0;
  const b = odds - 1; // net fractional odds
  const p = modelProb;
  const q = 1 - modelProb;
  const f = (b * p - q) / b;
  if (f <= 0) return 0;
  return Math.min(f, 0.25); // Cap full Kelly at 25% max for prudent risk ceiling
}

export function evaluateSingleBet(
  market: '1X2' | 'Totals' | 'BTTS',
  outcome: string,
  modelProbPercent: number,
  odds: number,
  bankroll: number = 1000,
  maxBankrollStakePct: number = 0.05
): ValueBet {
  const modelProb = modelProbPercent / 100;
  const implied = oddsToImpliedProb(odds);
  const edge = modelProb - implied;
  const ev = calculateEV(modelProb, odds);
  const kelly = calculateKellyFraction(modelProb, odds);
  const kellyHalf = kelly * 0.5;
  const kellyQuarter = kelly * 0.25;

  const isValueBet = ev >= 0.015 && edge >= 0.01; // Minimum 1.5% EV and 1% edge

  let confidence: 'High' | 'Medium' | 'Low' | 'None' = 'None';
  if (isValueBet) {
    if (ev >= 0.06 && edge >= 0.04) {
      confidence = 'High';
    } else if (ev >= 0.03 && edge >= 0.02) {
      confidence = 'Medium';
    } else {
      confidence = 'Low';
    }
  }

  // Recommended stake: Half-Kelly with maximum bankroll stake cap (e.g. 5%)
  const cappedFraction = Math.min(kellyHalf, maxBankrollStakePct);
  const recommendedStake = isValueBet
    ? Math.max(1, parseFloat((bankroll * cappedFraction).toFixed(2)))
    : 0;

  return {
    market,
    outcome,
    modelProbability: parseFloat(modelProbPercent.toFixed(2)),
    odds: parseFloat(odds.toFixed(2)),
    impliedProbability: parseFloat((implied * 100).toFixed(2)),
    edgePercent: parseFloat((edge * 100).toFixed(2)),
    expectedValue: parseFloat(ev.toFixed(4)),
    kellyFraction: parseFloat((kelly * 100).toFixed(2)),
    kellyHalfFraction: parseFloat((kellyHalf * 100).toFixed(2)),
    kellyQuarterFraction: parseFloat((kellyQuarter * 100).toFixed(2)),
    isValueBet,
    confidence,
    recommendedStake,
    recommendedStakePercent: parseFloat((cappedFraction * 100).toFixed(2)),
  };
}

export function identifyValueBets(
  modelProbs: OutcomeProbabilities,
  odds?: MarketOdds,
  bankroll: number = 1000
): ValueBetAnalysis | null {
  if (!odds || odds.home <= 1 || odds.draw <= 1 || odds.away <= 1) {
    return null;
  }

  const evaluations: ValueBet[] = [];

  // 1X2 Market
  evaluations.push(evaluateSingleBet('1X2', 'Home Win', modelProbs.homeWin, odds.home, bankroll));
  evaluations.push(evaluateSingleBet('1X2', 'Draw', modelProbs.draw, odds.draw, bankroll));
  evaluations.push(evaluateSingleBet('1X2', 'Away Win', modelProbs.awayWin, odds.away, bankroll));

  // Over/Under 2.5 Market (if odds provided)
  if (odds.over25 && odds.over25 > 1 && modelProbs.over25 !== undefined) {
    evaluations.push(evaluateSingleBet('Totals', 'Over 2.5', modelProbs.over25, odds.over25, bankroll));
  }
  if (odds.under25 && odds.under25 > 1 && modelProbs.under25 !== undefined) {
    evaluations.push(evaluateSingleBet('Totals', 'Under 2.5', modelProbs.under25, odds.under25, bankroll));
  }

  // BTTS Market (if odds provided)
  if (odds.bttsYes && odds.bttsYes > 1 && modelProbs.bttsYes !== undefined) {
    evaluations.push(evaluateSingleBet('BTTS', 'BTTS Yes', modelProbs.bttsYes, odds.bttsYes, bankroll));
  }
  if (odds.bttsNo && odds.bttsNo > 1 && modelProbs.bttsNo !== undefined) {
    evaluations.push(evaluateSingleBet('BTTS', 'BTTS No', modelProbs.bttsNo, odds.bttsNo, bankroll));
  }

  const valueBets = evaluations.filter((v) => v.isValueBet).sort((a, b) => b.expectedValue - a.expectedValue);
  const bestValueBet = valueBets.length > 0 ? valueBets[0] : null;

  return {
    valueBets: evaluations,
    bestValueBet,
    hasValue: valueBets.length > 0,
    summary: {
      totalEvaluated: evaluations.length,
      valueOpportunitiesFound: valueBets.length,
      bankroll,
    },
  };
}
