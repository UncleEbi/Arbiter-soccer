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

export type { TeamLineupInfo, MatchStatsInfo, MatchData } from './fixtures';
export { DEFAULT_SHELF_FIXTURES } from './fixtures';
import { MatchData, DEFAULT_SHELF_FIXTURES } from './fixtures';

// Local-first shelf repository initialized from default benchmark fixtures
const matches: Map<string, MatchData> = new Map(
  DEFAULT_SHELF_FIXTURES.map((m) => [String(m.fixtureId), m])
);
const feedManager = new LiveFeedManager(matches);

// Compute prediction based on sport and country context
export function computeMatchPrediction(match: MatchData): any {
  const s = match.sportSpecificStats || {};
  switch (match.sport) {
    case 'basketball':
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
    case 'hockey':
      return predictHockeyNHL(
        match.homeTeam,
        match.awayTeam,
        s.homeAttack ?? 3.5,
        s.homeGAA ?? 2.7,
        s.awayAttack ?? 3.2,
        s.awayGAA ?? 2.5,
        match.lineupInfo ? [`Goalies: ${match.lineupInfo.home.keyPlayers[2]} vs ${match.lineupInfo.away.keyPlayers[2]}`] : []
      );
    case 'tennis':
      return predictTennis(
        match.homeTeam,
        match.awayTeam,
        s.player1Hold ?? 0.87,
        s.player2Hold ?? 0.89,
        s.surface ?? 'Hard',
        [`Surface: ${s.surface || 'Hard'} Court`]
      );
    default:
      const lineupMod = deriveLineupModifier(match);
      return predictPoissonDC(match.homeTeam, match.awayTeam, dynamicRatingEngine.getAsMap(), match.liveStats, lineupMod);
  }
}

// Compute lineup modifier from team absentees and formation
function deriveLineupModifier(match: MatchData): LineupModifier {
  let homeAttackMod = 1.0, homeDefMod = 1.0, awayAttackMod = 1.0, awayDefMod = 1.0;
  const notes: string[] = [];

  const checkTeam = (team: string, abs: string[], isHome: boolean) => {
    if (abs.some((a) => /Saliba|Alisson|Martínez|van Dijk|Courtois|Rodri/i.test(a))) {
      if (isHome) homeDefMod *= 1.08;
      else awayDefMod *= 1.08;
      notes.push(`Lineup Alert: ${team} missing key defensive personnel.`);
    }
    if (abs.some((a) => /Haaland|Saka|Kane|Mbappé|Vinicius|Salah/i.test(a))) {
      if (isHome) homeAttackMod *= 0.88;
      else awayAttackMod *= 0.88;
      notes.push(`Lineup Alert: ${team} missing primary goalscorer.`);
    }
  };

  if (match.lineupInfo) {
    checkTeam(match.homeTeam, match.lineupInfo.home.absentees, true);
    checkTeam(match.awayTeam, match.lineupInfo.away.absentees, false);
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
