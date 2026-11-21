import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import {
  SportType,
  predictPoissonDC,
  predictBasketballNBA,
  predictHockeyNHL,
  predictTennis,
  TeamRatings,
  LiveStats,
  LineupModifier,
  normalizeTeamName,
} from './model';
import {
  identifyValueBets,
  MarketOdds,
  ValueBetAnalysis,
  oddsToImpliedProb,
  calculateEV,
  calculateKellyFraction,
} from './valueBetting';
import { BankrollJournal, BetRecord } from './journal';
import { runBacktest, BacktestOptions } from './backtest';
import { dynamicRatingEngine, DynamicTeamRating } from './dynamicRatings';
import { calibrationTracker, CalibrationMetrics } from './calibration';
import {
  generateDailyDigest,
  exportMatchesToCSV,
  exportMatchesToJSON,
  dispatchWebhook,
  DailyDigestReport,
} from './exportAndDigest';
import { LiveFeedManager, FeedStatus } from './liveIngestion';

const app = express();
const PORT = parseInt(process.env.PORT ?? '5000', 10);
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || 'demo';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory bankroll journal instance
const journal = new BankrollJournal(1000);

export interface TeamLineupInfo {
  formation: string;
  status: 'Confirmed' | 'Predicted';
  keyPlayers: string[];
  absentees: string[];
  tacticalStyle: string;
}

export interface MatchStatsInfo {
  homeForm: Array<'W' | 'D' | 'L'>;
  awayForm: Array<'W' | 'D' | 'L'>;
  homeAvgScored: number;
  homeAvgConceded: number;
  awayAvgScored: number;
  awayAvgConceded: number;
  homeCleanSheetPct: number;
  awayCleanSheetPct: number;
  h2hSummary: string;
}

// In-memory cache for match data
export interface MatchData {
  fixtureId: number;
  sport: SportType;
  country: string;
  homeTeam: string;
  awayTeam: string;
  kickoffDate: string; // ISO 8601 string
  league: string;
  venue: string;
  round?: string;
  homeGoals?: number;
  awayGoals?: number;
  status: 'scheduled' | 'live' | 'finished';
  liveStats?: LiveStats;
  lineupInfo?: {
    home: TeamLineupInfo;
    away: TeamLineupInfo;
  };
  stats?: MatchStatsInfo;
  odds?: MarketOdds;
  sportSpecificStats?: Record<string, any>;
}

// Simulated match repository across sports and countries
const matches: Map<string, MatchData> = new Map();
const feedManager = new LiveFeedManager(matches);

// 1. England: Premier League (Soccer)
matches.set('1', {
  fixtureId: 1,
  sport: 'soccer',
  country: 'England',
  homeTeam: 'Manchester United',
  awayTeam: 'Liverpool',
  kickoffDate: '2026-11-21T17:30:00Z',
  league: 'Premier League',
  venue: 'Old Trafford, Manchester',
  round: 'Matchday 12',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: '4-2-3-1',
      status: 'Confirmed',
      keyPlayers: ['Bruno Fernandes', 'Marcus Rashford', 'Kobbie Mainoo'],
      absentees: ['Luke Shaw (Hamstring)', 'Lisandro Martínez (Doubtful)'],
      tacticalStyle: 'Direct transition with rapid wing counters',
    },
    away: {
      formation: '4-3-3',
      status: 'Confirmed',
      keyPlayers: ['Mohamed Salah', 'Alexis Mac Allister', 'Virgil van Dijk'],
      absentees: ['Alisson Becker (Hamstring)'],
      tacticalStyle: 'High-intensity counter-pressing and fluid wide rotation',
    },
  },
  stats: {
    homeForm: ['W', 'D', 'W', 'L', 'W'],
    awayForm: ['W', 'W', 'W', 'D', 'W'],
    homeAvgScored: 1.7,
    homeAvgConceded: 1.3,
    awayAvgScored: 2.3,
    awayAvgConceded: 0.9,
    homeCleanSheetPct: 30,
    awayCleanSheetPct: 50,
    h2hSummary: 'Last 5 H2H: Liverpool 3 wins, Man Utd 1 win, 1 draw (avg 3.4 goals/game)',
  },
  odds: {
    home: 3.20,
    draw: 3.80,
    away: 2.10,
    over25: 1.65,
    under25: 2.25,
    bttsYes: 1.55,
    bttsNo: 2.40,
    bookmaker: 'BetFair Exchange',
  },
});

// 2. Spain: La Liga (Soccer)
matches.set('2', {
  fixtureId: 2,
  sport: 'soccer',
  country: 'Spain',
  homeTeam: 'Real Madrid',
  awayTeam: 'Barcelona',
  kickoffDate: '2026-11-22T20:00:00Z',
  league: 'La Liga',
  venue: 'Santiago Bernabéu, Madrid',
  round: 'Matchday 11 (El Clásico)',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: '4-3-1-2',
      status: 'Predicted',
      keyPlayers: ['Vinicius Jr', 'Jude Bellingham', 'Kylian Mbappé', 'Fede Valverde'],
      absentees: ['David Alaba (Knee)', 'Courtois (Adductor)'],
      tacticalStyle: 'Direct vertical attacks and dynamic half-space overloads',
    },
    away: {
      formation: '4-2-3-1',
      status: 'Predicted',
      keyPlayers: ['Lamine Yamal', 'Robert Lewandowski', 'Raphinha', 'Pedri'],
      absentees: ['Ter Stegen (Knee)', 'Araújo (Hamstring)'],
      tacticalStyle: 'High defensive line, aggressive offside trap, and vertical possession',
    },
  },
  stats: {
    homeForm: ['W', 'W', 'W', 'D', 'W'],
    awayForm: ['W', 'W', 'W', 'W', 'L'],
    homeAvgScored: 2.4,
    homeAvgConceded: 0.8,
    awayAvgScored: 2.8,
    awayAvgConceded: 1.1,
    homeCleanSheetPct: 55,
    awayCleanSheetPct: 45,
    h2hSummary: 'Last 5 H2H: Real Madrid 3 wins, Barcelona 2 wins (avg 3.8 goals/game)',
  },
  odds: {
    home: 2.05,
    draw: 3.75,
    away: 3.40,
    over25: 1.50,
    under25: 2.50,
    bttsYes: 1.48,
    bttsNo: 2.60,
    bookmaker: 'Pinnacle',
  },
});

// 3. Italy: Serie A (Soccer)
matches.set('3', {
  fixtureId: 3,
  sport: 'soccer',
  country: 'Italy',
  homeTeam: 'Inter',
  awayTeam: 'Milan',
  kickoffDate: '2026-11-23T19:45:00Z',
  league: 'Serie A',
  venue: 'San Siro, Milan',
  round: 'Derby della Madonnina',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: '3-5-2',
      status: 'Confirmed',
      keyPlayers: ['Lautaro Martínez', 'Marcus Thuram', 'Nicolò Barella'],
      absentees: ['Hakan Çalhanoğlu (Doubtful)'],
      tacticalStyle: 'Wing-back overloads and structured defensive solidity',
    },
    away: {
      formation: '4-2-3-1',
      status: 'Confirmed',
      keyPlayers: ['Rafael Leão', 'Christian Pulisic', 'Théo Hernandez'],
      absentees: ['Ismaël Bennacer (Calf)'],
      tacticalStyle: 'Left-wing isolation and explosive transition speed',
    },
  },
  stats: {
    homeForm: ['W', 'W', 'W', 'D', 'W'],
    awayForm: ['W', 'L', 'W', 'W', 'D'],
    homeAvgScored: 2.2,
    homeAvgConceded: 0.7,
    awayAvgScored: 1.8,
    awayAvgConceded: 1.2,
    homeCleanSheetPct: 55,
    awayCleanSheetPct: 35,
    h2hSummary: 'Last 5 H2H: Inter 4 wins, Milan 1 win (avg 2.8 goals/game)',
  },
  odds: {
    home: 1.95,
    draw: 3.60,
    away: 3.85,
    over25: 1.75,
    under25: 2.05,
    bookmaker: 'Bet365',
  },
});

// 4. Germany: Bundesliga (Soccer)
matches.set('4', {
  fixtureId: 4,
  sport: 'soccer',
  country: 'Germany',
  homeTeam: 'Bayern Munich',
  awayTeam: 'Borussia Dortmund',
  kickoffDate: '2026-11-23T17:30:00Z',
  league: 'Bundesliga',
  venue: 'Allianz Arena, Munich',
  round: 'Matchday 11 (Der Klassiker)',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: '4-2-3-1',
      status: 'Predicted',
      keyPlayers: ['Harry Kane', 'Jamal Musiala', 'Michael Olise'],
      absentees: ['Hiroki Ito (Metatarsal)'],
      tacticalStyle: 'High counter-press and relentless wing overloads',
    },
    away: {
      formation: '4-3-3',
      status: 'Predicted',
      keyPlayers: ['Serhou Guirassy', 'Julian Brandt', 'Nico Schlotterbeck'],
      absentees: ['Karim Adeyemi (Muscle)'],
      tacticalStyle: 'Rapid vertical wing breaks and physical presence',
    },
  },
  stats: {
    homeForm: ['W', 'W', 'W', 'W', 'D'],
    awayForm: ['L', 'W', 'L', 'W', 'D'],
    homeAvgScored: 3.1,
    homeAvgConceded: 1.0,
    awayAvgScored: 1.9,
    awayAvgConceded: 1.7,
    homeCleanSheetPct: 40,
    awayCleanSheetPct: 20,
    h2hSummary: 'Last 5 H2H: Bayern 3 wins, Dortmund 1 win, 1 draw (avg 4.2 goals/game)',
  },
  odds: {
    home: 1.50,
    draw: 4.80,
    away: 5.80,
    over25: 1.40,
    under25: 3.00,
    bookmaker: 'Pinnacle',
  },
});

// 5. USA: Major League Soccer (Soccer)
matches.set('5', {
  fixtureId: 5,
  sport: 'soccer',
  country: 'USA',
  homeTeam: 'Inter Miami',
  awayTeam: 'LAFC',
  kickoffDate: '2026-11-24T00:30:00Z',
  league: 'Major League Soccer (MLS)',
  venue: 'Chase Stadium, Fort Lauderdale',
  round: 'MLS Cup Playoff',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: '4-3-3',
      status: 'Confirmed',
      keyPlayers: ['Lionel Messi', 'Luis Suárez', 'Sergio Busquets', 'Jordi Alba'],
      absentees: ['Facundo Farías (ACL)'],
      tacticalStyle: 'Centrally anchored playmaking with Messi roaming',
    },
    away: {
      formation: '4-3-3',
      status: 'Confirmed',
      keyPlayers: ['Denis Bouanga', 'Olivier Giroud', 'Mateusz Bogusz'],
      absentees: ['Cristian Olivera (Suspended)'],
      tacticalStyle: 'Direct wing speed and target forward hold-up play',
    },
  },
  stats: {
    homeForm: ['W', 'W', 'W', 'W', 'D'],
    awayForm: ['W', 'W', 'D', 'W', 'L'],
    homeAvgScored: 2.6,
    homeAvgConceded: 1.4,
    awayAvgScored: 2.1,
    awayAvgConceded: 1.3,
    homeCleanSheetPct: 25,
    awayCleanSheetPct: 30,
    h2hSummary: 'Last 3 H2H: Inter Miami 2 wins, LAFC 1 win (avg 3.7 goals/game)',
  },
  odds: {
    home: 1.85,
    draw: 3.90,
    away: 3.70,
    over25: 1.48,
    under25: 2.60,
    bookmaker: 'DraftKings',
  },
});

// 6. USA: Basketball (NBA)
matches.set('6', {
  fixtureId: 6,
  sport: 'basketball',
  country: 'USA',
  homeTeam: 'Boston Celtics',
  awayTeam: 'Los Angeles Lakers',
  kickoffDate: '2026-11-22T01:30:00Z',
  league: 'NBA',
  venue: 'TD Garden, Boston',
  round: 'Regular Season',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: 'Starting 5',
      status: 'Confirmed',
      keyPlayers: ['Jayson Tatum', 'Jaylen Brown', 'Derrick White', 'Jrue Holiday', 'Kristaps Porzingis'],
      absentees: ['None'],
      tacticalStyle: 'Five-out perimeter shooting and switch-heavy perimeter defense',
    },
    away: {
      formation: 'Starting 5',
      status: 'Confirmed',
      keyPlayers: ['LeBron James', 'Anthony Davis', 'Austin Reaves', "D'Angelo Russell"],
      absentees: ['Jarred Vanderbilt (Foot)'],
      tacticalStyle: 'Paint dominance, pick-and-roll creation, and interior rim protection',
    },
  },
  sportSpecificStats: {
    homePace: 101.4,
    awayPace: 100.8,
    homeORtg: 122.5,
    homeDRtg: 109.8,
    awayORtg: 115.2,
    awayDRtg: 114.1,
  },
  stats: {
    homeForm: ['W', 'W', 'W', 'W', 'L'],
    awayForm: ['W', 'L', 'W', 'L', 'W'],
    homeAvgScored: 120.4,
    homeAvgConceded: 109.2,
    awayAvgScored: 114.5,
    awayAvgConceded: 113.8,
    homeCleanSheetPct: 0,
    awayCleanSheetPct: 0,
    h2hSummary: 'Last 5 H2H: Celtics 4 wins, Lakers 1 win (Avg total 231.4 pts)',
  },
});

// 7. USA/Canada: Ice Hockey (NHL)
matches.set('7', {
  fixtureId: 7,
  sport: 'hockey',
  country: 'USA',
  homeTeam: 'Edmonton Oilers',
  awayTeam: 'Florida Panthers',
  kickoffDate: '2026-11-22T03:00:00Z',
  league: 'NHL',
  venue: 'Rogers Place, Edmonton',
  round: 'Stanley Cup Rematch',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: 'Lines 1-4 + Goalie',
      status: 'Confirmed',
      keyPlayers: ['Connor McDavid', 'Leon Draisaitl', 'Stuart Skinner (Starting G)'],
      absentees: ['Evander Kane (Hip)'],
      tacticalStyle: 'Elite rush offense and generational power play unit',
    },
    away: {
      formation: 'Lines 1-4 + Goalie',
      status: 'Confirmed',
      keyPlayers: ['Aleksander Barkov', 'Matthew Tkachuk', 'Sergei Bobrovsky (Starting G)'],
      absentees: ['None'],
      tacticalStyle: 'Relentless forecheck, physical neutral-zone trap, and clutch goaltending',
    },
  },
  sportSpecificStats: {
    homeAttack: 3.5,
    homeGAA: 2.7,
    awayAttack: 3.2,
    awayGAA: 2.5,
  },
  stats: {
    homeForm: ['W', 'W', 'L', 'W', 'W'],
    awayForm: ['W', 'W', 'W', 'L', 'W'],
    homeAvgScored: 3.6,
    homeAvgConceded: 2.8,
    awayAvgScored: 3.4,
    awayAvgConceded: 2.6,
    homeCleanSheetPct: 15,
    awayCleanSheetPct: 20,
    h2hSummary: 'Stanley Cup Final rematch; Florida won series 4-3',
  },
});

// 8. International: Tennis (ATP)
matches.set('8', {
  fixtureId: 8,
  sport: 'tennis',
  country: 'International',
  homeTeam: 'Carlos Alcaraz',
  awayTeam: 'Jannik Sinner',
  kickoffDate: '2026-11-23T14:00:00Z',
  league: 'ATP Masters 1000',
  venue: 'Centre Court, Indoor Hard',
  round: 'Final',
  status: 'scheduled',
  lineupInfo: {
    home: {
      formation: 'Singles',
      status: 'Confirmed',
      keyPlayers: ['Carlos Alcaraz (World No. 2)'],
      absentees: ['Full Fitness'],
      tacticalStyle: 'All-court aggression, heavy topspin forehand, and drop-shot variety',
    },
    away: {
      formation: 'Singles',
      status: 'Confirmed',
      keyPlayers: ['Jannik Sinner (World No. 1)'],
      absentees: ['Full Fitness'],
      tacticalStyle: 'Blistering baseline velocity, explosive backhand, and improved first serve',
    },
  },
  sportSpecificStats: {
    player1Hold: 0.87,
    player2Hold: 0.89,
    surface: 'Hard',
  },
  stats: {
    homeForm: ['W', 'W', 'W', 'W', 'W'],
    awayForm: ['W', 'W', 'W', 'W', 'W'],
    homeAvgScored: 2.1,
    homeAvgConceded: 0.4,
    awayAvgScored: 2.3,
    awayAvgConceded: 0.3,
    homeCleanSheetPct: 70,
    awayCleanSheetPct: 75,
    h2hSummary: 'H2H Tied 6-6 (all-time great rivalry)',
  },
});

// Compute prediction based on sport and country context
export function computeMatchPrediction(match: MatchData): any {
  if (match.sport === 'basketball') {
    const s = match.sportSpecificStats || {};
    return predictBasketballNBA(
      match.homeTeam,
      match.awayTeam,
      s.homePace ?? 101.4,
      s.awayPace ?? 100.8,
      s.homeORtg ?? 122.5,
      s.homeDRtg ?? 109.8,
      s.awayORtg ?? 115.2,
      s.awayDRtg ?? 114.1,
      match.lineupInfo ? [`${match.homeTeam}: ${match.lineupInfo.home.keyPlayers.join(', ')}`, `${match.awayTeam}: ${match.lineupInfo.away.keyPlayers.join(', ')}`] : []
    );
  }
  if (match.sport === 'hockey') {
    const s = match.sportSpecificStats || {};
    return predictHockeyNHL(
      match.homeTeam,
      match.awayTeam,
      s.homeAttack ?? 3.5,
      s.homeGAA ?? 2.7,
      s.awayAttack ?? 3.2,
      s.awayGAA ?? 2.5,
      match.lineupInfo ? [`Goalies: ${match.lineupInfo.home.keyPlayers[2]} vs ${match.lineupInfo.away.keyPlayers[2]}`] : []
    );
  }
  if (match.sport === 'tennis') {
    const s = match.sportSpecificStats || {};
    return predictTennis(
      match.homeTeam,
      match.awayTeam,
      s.player1Hold ?? 0.87,
      s.player2Hold ?? 0.89,
      s.surface ?? 'Hard',
      [`Surface: ${s.surface || 'Hard'} Court`]
    );
  }

  // Default: Soccer
  const lineupMod = deriveLineupModifier(match);
  return predictPoissonDC(match.homeTeam, match.awayTeam, dynamicRatingEngine.getAsMap(), match.liveStats, lineupMod);
}

// Compute lineup modifier from team absentees and formation
function deriveLineupModifier(match: MatchData): LineupModifier {
  let homeAttackMod = 1.0;
  let homeDefMod = 1.0;
  let awayAttackMod = 1.0;
  let awayDefMod = 1.0;
  const notes: string[] = [];

  if (match.lineupInfo) {
    const homeAbs = match.lineupInfo.home.absentees;
    const awayAbs = match.lineupInfo.away.absentees;

    if (homeAbs.some((a) => /Saliba|Alisson|Martínez|van Dijk|Courtois|Rodri/i.test(a))) {
      homeDefMod *= 1.08;
      notes.push(`Lineup Alert: ${match.homeTeam} missing key defensive personnel.`);
    }
    if (awayAbs.some((a) => /Saliba|Alisson|Martínez|van Dijk|Courtois|Rodri/i.test(a))) {
      awayDefMod *= 1.08;
      notes.push(`Lineup Alert: ${match.awayTeam} missing key defensive personnel.`);
    }

    if (homeAbs.some((a) => /Haaland|Saka|Kane|Mbappé|Vinicius|Salah/i.test(a))) {
      homeAttackMod *= 0.88;
      notes.push(`Lineup Alert: ${match.homeTeam} missing primary goalscorer.`);
    }
    if (awayAbs.some((a) => /Haaland|Saka|Kane|Mbappé|Vinicius|Salah/i.test(a))) {
      awayAttackMod *= 0.88;
      notes.push(`Lineup Alert: ${match.awayTeam} missing primary attacking focal point.`);
    }
  }

  return {
    homeAttackMultiplier: homeAttackMod,
    homeDefenceMultiplier: homeDefMod,
    awayAttackMultiplier: awayAttackMod,
    awayDefenceMultiplier: awayDefMod,
    lineupNotes: notes,
  };
}

export { oddsToImpliedProb, calculateEV, calculateKellyFraction, identifyValueBets };

// ==================== REST API ENDPOINTS ====================

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Sports Prediction & Analytics Intelligence API is active (Multi-Sport & Global Modeling)',
    version: '1.3.0',
    currentBankroll: journal.getBankroll(),
  });
});

// Get upcoming matches with optional sport and country filters
app.get('/matches/upcoming', (req: Request, res: Response) => {
  try {
    const sportFilter = req.query.sport as string | undefined;
    const countryFilter = req.query.country as string | undefined;

    let list = Array.from(matches.values());
    if (sportFilter && sportFilter !== 'all') {
      list = list.filter((m) => m.sport.toLowerCase() === sportFilter.toLowerCase());
    }
    if (countryFilter && countryFilter !== 'all') {
      list = list.filter((m) => m.country.toLowerCase() === countryFilter.toLowerCase());
    }

    res.json({ matches: list });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching matches:', errMessage);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Get match prediction endpoint
app.get('/matches/:fixtureId/prediction', async (req: Request, res: Response) => {
  const fixtureId = req.params.fixtureId as string;
  const match = matches.get(fixtureId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const prediction = computeMatchPrediction(match);

  let effectiveOdds: MarketOdds | undefined = match.odds;
  const qHome = req.query.homeOdds ? parseFloat(req.query.homeOdds as string) : undefined;
  const qDraw = req.query.drawOdds ? parseFloat(req.query.drawOdds as string) : undefined;
  const qAway = req.query.awayOdds ? parseFloat(req.query.awayOdds as string) : undefined;

  if (qHome && qDraw && qAway && qHome > 1 && qDraw > 1 && qAway > 1) {
    effectiveOdds = {
      home: qHome,
      draw: qDraw,
      away: qAway,
      bookmaker: 'Query Parameter',
      lastUpdated: new Date().toISOString(),
    };
  }

  const bankroll = req.query.bankroll ? parseFloat(req.query.bankroll as string) : journal.getBankroll();
  const valueBetting = effectiveOdds && prediction.outcomeProbabilities
    ? identifyValueBets(prediction.outcomeProbabilities, effectiveOdds, bankroll)
    : null;

  res.json({
    fixtureId: match.fixtureId,
    sport: match.sport,
    country: match.country,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    kickoffDate: match.kickoffDate,
    league: match.league,
    venue: match.venue,
    round: match.round,
    status: match.status,
    lineupInfo: match.lineupInfo,
    stats: match.stats,
    odds: effectiveOdds,
    prediction,
    valueBetting,
  });
});

// Get comprehensive predictions for all upcoming matches
app.get('/matches/predictions', (req: Request, res: Response) => {
  const sportFilter = req.query.sport as string | undefined;
  const countryFilter = req.query.country as string | undefined;

  let list = Array.from(matches.values());
  if (sportFilter && sportFilter !== 'all') {
    list = list.filter((m) => m.sport.toLowerCase() === sportFilter.toLowerCase());
  }
  if (countryFilter && countryFilter !== 'all') {
    list = list.filter((m) => m.country.toLowerCase() === countryFilter.toLowerCase());
  }

  const allPredictions = list.map((m) => ({
    fixtureId: m.fixtureId,
    sport: m.sport,
    country: m.country,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    kickoffDate: m.kickoffDate,
    league: m.league,
    venue: m.venue,
    round: m.round,
    status: m.status,
    lineupInfo: m.lineupInfo,
    stats: m.stats,
    prediction: computeMatchPrediction(m),
  }));

  res.json({
    total: allPredictions.length,
    predictions: allPredictions,
  });
});

// Scan upcoming matches with odds for value opportunities
app.get('/matches/value-bets', (req: Request, res: Response) => {
  const bankroll = req.query.bankroll ? parseFloat(req.query.bankroll as string) : journal.getBankroll();
  const minEdge = req.query.minEdge ? parseFloat(req.query.minEdge as string) : 1.0;

  const results: Array<{
    fixtureId: number;
    match: string;
    kickoffDate: string;
    league: string;
    status: string;
    prediction: any;
    valueAnalysis: ValueBetAnalysis;
  }> = [];

  for (const match of matches.values()) {
    if (match.status === 'finished' || !match.odds) continue;
    const pred = computeMatchPrediction(match);
    if (!pred.outcomeProbabilities) continue;
    const valueAnalysis = identifyValueBets(pred.outcomeProbabilities, match.odds, bankroll);
    if (valueAnalysis && valueAnalysis.hasValue) {
      const qualifying = valueAnalysis.valueBets.filter((v) => v.isValueBet && v.edgePercent >= minEdge);
      if (qualifying.length > 0) {
        results.push({
          fixtureId: match.fixtureId,
          match: `${match.homeTeam} vs ${match.awayTeam}`,
          kickoffDate: match.kickoffDate,
          league: match.league,
          status: match.status,
          prediction: pred,
          valueAnalysis,
        });
      }
    }
  }

  res.json({
    totalFound: results.length,
    bankroll,
    opportunities: results,
  });
});

// Update or set odds for a fixture
app.post('/matches/:fixtureId/odds', (req: Request, res: Response) => {
  const fixtureId = req.params.fixtureId as string;
  const match = matches.get(fixtureId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { home, draw, away, over25, under25, bttsYes, bttsNo, bookmaker } = req.body;
  if (!home || !draw || !away || home <= 1 || draw <= 1 || away <= 1) {
    return res.status(400).json({ error: 'Invalid odds. home, draw, away greater than 1.0 required.' });
  }

  match.odds = {
    home: parseFloat(home),
    draw: parseFloat(draw),
    away: parseFloat(away),
    over25: over25 ? parseFloat(over25) : undefined,
    under25: under25 ? parseFloat(under25) : undefined,
    bttsYes: bttsYes ? parseFloat(bttsYes) : undefined,
    bttsNo: bttsNo ? parseFloat(bttsNo) : undefined,
    bookmaker: bookmaker || 'Manual Ingestion',
    lastUpdated: new Date().toISOString(),
  };

  res.json({ success: true, fixtureId: match.fixtureId, odds: match.odds });
});

// Live stats update endpoint
app.post('/matches/:fixtureId/live-stats', (req: Request, res: Response) => {
  const fixtureId = req.params.fixtureId as string;
  const match = matches.get(fixtureId);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  const { possession, shots, shotsOnTarget, corners, fouls, homeGoals, awayGoals, elapsedMinutes } = req.body;
  match.liveStats = {
    possession: possession !== undefined ? Number(possession) : match.liveStats?.possession ?? 50,
    shots: shots !== undefined ? Number(shots) : match.liveStats?.shots ?? 0,
    shotsOnTarget: shotsOnTarget !== undefined ? Number(shotsOnTarget) : match.liveStats?.shotsOnTarget ?? 0,
    corners: corners !== undefined ? Number(corners) : match.liveStats?.corners ?? 0,
    fouls: fouls !== undefined ? Number(fouls) : match.liveStats?.fouls ?? 0,
    homeGoals: homeGoals !== undefined ? Number(homeGoals) : match.homeGoals ?? 0,
    awayGoals: awayGoals !== undefined ? Number(awayGoals) : match.awayGoals ?? 0,
    elapsedMinutes: elapsedMinutes !== undefined ? Number(elapsedMinutes) : match.liveStats?.elapsedMinutes ?? 45,
  };

  if (homeGoals !== undefined) match.homeGoals = Number(homeGoals);
  if (awayGoals !== undefined) match.awayGoals = Number(awayGoals);
  match.status = 'live';

  const livePrediction = computeMatchPrediction(match);
  res.json({ success: true, match, livePrediction });
});

// Result reporting endpoint
app.post('/matches/:fixtureId/result', async (req: Request, res: Response) => {
  const fixtureId = req.params.fixtureId as string;
  const { homeGoals, awayGoals } = req.body;

  const match = matches.get(fixtureId);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (homeGoals === undefined || awayGoals === undefined) {
    return res.status(400).json({ error: 'homeGoals and awayGoals are required' });
  }

  match.homeGoals = Number(homeGoals);
  match.awayGoals = Number(awayGoals);
  match.status = 'finished';

  let actualOutcome: 'Home Win' | 'Draw' | 'Away Win';
  if (match.homeGoals > match.awayGoals) actualOutcome = 'Home Win';
  else if (match.homeGoals < match.awayGoals) actualOutcome = 'Away Win';
  else actualOutcome = 'Draw';

  const pendingBets = journal.getBets({ fixtureId: match.fixtureId, status: 'pending' });
  const settledBets: BetRecord[] = [];
  for (const b of pendingBets) {
    const won = b.outcome === actualOutcome;
    const settled = journal.settleBet(b.id, won ? 'won' : 'lost', `${match.homeGoals}-${match.awayGoals}`);
    settledBets.push(settled);
  }

  const prediction = computeMatchPrediction(match);

  // Update Dynamic Bayesian Ratings
  const ratingUpdates = dynamicRatingEngine.updateFromMatch(
    match.homeTeam,
    match.awayTeam,
    Number(homeGoals),
    Number(awayGoals),
    new Date().toISOString(),
    match.sport
  );

  // Record Calibration event
  if (prediction.outcomeProbabilities) {
    calibrationTracker.recordPrediction({
      sport: match.sport,
      match: `${match.homeTeam} vs ${match.awayTeam}`,
      market: '1X2 Match Winner',
      predictedProb: prediction.outcomeProbabilities.homeWin,
      actualOutcome: actualOutcome === 'Home Win',
    });
  }

  res.json({
    fixtureId: match.fixtureId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    actualResult: `${homeGoals}-${awayGoals}`,
    actualOutcome,
    prediction,
    ratingUpdates,
    settledBetsCount: settledBets.length,
    bankrollAfter: journal.getBankroll(),
  });
});

// Prediction records & stats
app.get('/bets', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const fixtureId = req.query.fixtureId ? parseInt(req.query.fixtureId as string, 10) : undefined;
  const bets = journal.getBets({ status, fixtureId });
  res.json({ count: bets.length, bets });
});

app.post('/bets', (req: Request, res: Response) => {
  try {
    const { fixtureId, match, market, outcome, modelProb, odds, stake } = req.body;
    const bet = journal.placeBet({ fixtureId, match, market, outcome, modelProb, odds, stake });
    res.json({ success: true, bet, currentBankroll: journal.getBankroll() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/bets/:id/settle', (req: Request, res: Response) => {
  try {
    const bet = journal.settleBet(req.params.id as string, req.body.status, req.body.actualScore);
    res.json({ success: true, bet, currentBankroll: journal.getBankroll() });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/journal/stats', (_req: Request, res: Response) => {
  res.json(journal.getStats());
});

app.post('/backtest', (req: Request, res: Response) => {
  try {
    const result = runBacktest(req.body || {});
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== OPTION 1: LIVE FEEDS & INGESTION PIPELINE ====================
app.get('/api/feed/status', (_req: Request, res: Response) => {
  res.json(feedManager.getStatus());
});

app.post('/api/feed/sync', async (req: Request, res: Response) => {
  try {
    const result = await feedManager.sync(req.body?.provider);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/feed/config', (req: Request, res: Response) => {
  try {
    const updated = feedManager.updateConfig(req.body || {});
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==================== OPTION 3: DYNAMIC BAYESIAN RATINGS ====================
app.get('/ratings/teams', (req: Request, res: Response) => {
  const sport = req.query.sport as SportType | undefined;
  const ratings = dynamicRatingEngine.getAllTeams(sport);
  res.json({ total: ratings.length, ratings });
});

app.get('/ratings/teams/:teamName/history', (req: Request, res: Response) => {
  const team = dynamicRatingEngine.getTeam(req.params.teamName as string);
  res.json({ team: team.team, sport: team.sport, history: team.history, currentRating: team });
});

// ==================== OPTION 4: MODEL CALIBRATION & RELIABILITY ====================
app.get('/calibration/metrics', (req: Request, res: Response) => {
  const sport = req.query.sport as SportType | undefined;
  const metrics = calibrationTracker.computeMetrics(sport);
  res.json(metrics);
});

app.get('/calibration/records', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
  res.json({ records: calibrationTracker.getRecentRecords(limit) });
});

app.post('/calibration/record', (req: Request, res: Response) => {
  try {
    const rec = calibrationTracker.recordPrediction(req.body);
    res.json({ success: true, record: rec });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== OPTION 5: DAILY DIGEST & EXPORT SYSTEM ====================
app.get('/digest/daily', (req: Request, res: Response) => {
  const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const digest = generateDailyDigest(Array.from(matches.values()), dateStr);
  res.json(digest);
});

app.get('/export/csv', (_req: Request, res: Response) => {
  const csv = exportMatchesToCSV(Array.from(matches.values()));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="arbiter-sports-predictions.csv"');
  res.send(csv);
});

app.get('/export/json', (_req: Request, res: Response) => {
  const jsonStr = exportMatchesToJSON(Array.from(matches.values()));
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="arbiter-sports-predictions.json"');
  res.send(jsonStr);
});

app.post('/export/webhook', async (req: Request, res: Response) => {
  const { webhookUrl, date } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl is required' });
  const digest = generateDailyDigest(Array.from(matches.values()), date || new Date().toISOString().split('T')[0]);
  const result = await dispatchWebhook(webhookUrl, digest);
  res.json(result);
});

// Serve static client production build if available
const clientBuildPath = path.resolve(__dirname, '../client/build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.use((req: Request, res: Response, next) => {
    if (
      req.path.startsWith('/matches') ||
      req.path.startsWith('/health') ||
      req.path.startsWith('/bets') ||
      req.path.startsWith('/journal') ||
      req.path.startsWith('/backtest') ||
      req.path.startsWith('/api/feed') ||
      req.path.startsWith('/ratings') ||
      req.path.startsWith('/calibration') ||
      req.path.startsWith('/digest') ||
      req.path.startsWith('/export')
    ) {
      return next();
    }
    const indexPath = path.join(clientBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });
}

// Only start listening if this file is executed directly
let server: import('http').Server | null = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sports Prediction & Analytics API running on port ${PORT}`);
  });
}

export { app, server, matches, journal, feedManager, dynamicRatingEngine, calibrationTracker };
