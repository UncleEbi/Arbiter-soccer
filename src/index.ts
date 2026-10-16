import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || 'demo';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory cache for match data
interface MatchData {
  fixtureId: number;
  homeTeam: string;
  awayTeam: string;
  homeGoals?: number;
  awayGoals?: number;
  status: 'scheduled' | 'live' | 'finished';
  liveStats?: {
    possession: number;
    shots: number;
    shotsOnTarget: number;
    corners: number;
    fouls: number;
  };
  odds?: {
    home: number; // decimal odds (e.g., 2.50)
    draw: number; // decimal odds (e.g., 3.40)
    away: number; // decimal odds (e.g., 2.80)
    lastUpdated?: string;
  };
}

// Simulated match data - in production, this would come from API-Football
const matches: Map<string, MatchData> = new Map();
// Pre-populate with some sample matches
matches.set('1', {
  fixtureId: 1,
  homeTeam: 'Manchester United',
  awayTeam: 'Liverpool',
  status: 'scheduled',
});
matches.set('2', {
  fixtureId: 2,
  homeTeam: 'Real Madrid',
  awayTeam: 'Barcelona',
  status: 'scheduled',
});

// --- API-FOOTBALL INTEGRATION ---
// Fetches historical match results to train Poisson ratings
// Documentation: https://www.api-football.com/documentation-v3
// Free tier: 100 requests/day, season coverage varies by league

interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    status: { long: string; short: string; elapsed: number };
  };
  league: { id: number; season: number; round: string };
  teams: {
    home: { id: number; name: string; winner: boolean };
    away: { id: number; name: string; winner: boolean };
  };
  goals: { home: number; away: number };
  score: {
    halftime: { home: number; away: number };
    fulltime: { home: number; away: number };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
}

interface ApiFootballResponse {
  get: string;
  parameters: { league: number; season: number };
  errors: Array<{ code: number; get: string; message: string }>;
  results: number;
  paging: { current: number; total: number };
  response: ApiFootballFixture[];
}

// Fetch historical fixtures from API-Football for a given league and season
async function fetchHistoricalFixtures(
  leagueId: number,
  season: number,
  fromDate?: string,
  toDate?: string
): Promise<ApiFootballFixture[]> {
  try {
    const url = new URL(
      'https://v3.football.api-sports.io/fixtures'
    );
    url.searchParams.set('league', leagueId.toString());
    url.searchParams.set('season', season.toString());
    if (fromDate) url.searchParams.set('from', fromDate);
    if (toDate) url.searchParams.set('to', toDate);

    const response = await axios.get<ApiFootballResponse>(url.toString(), {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
    });

    // Handle errors in response
    if (response.data.errors && response.data.errors.length > 0) {
      console.error('API-Football errors:', response.data.errors);
      return [];
    }

    // Filter to completed matches with valid full-time goals
    return response.data.response
      .filter(
        (f) =>
          f.fixture.status.short === 'FT' &&
          f.goals !== undefined &&
          f.goals.home !== null &&
          f.goals.away !== null
      )
      .sort(
        (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
      );
  } catch (error) {
    // TypeScript's 'error' type is 'unknown' in catch blocks; extract message safely
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error fetching fixtures for league ${leagueId}, season ${season}:`,
      errMessage
    );
    return [];
  }
}

// Normalize team name for rating lookup (lowercase, trim)
function normalizeTeamName(name: string): string {
  return name.toLowerCase().trim();
}

// Train Poisson ratings from historical match data using a simple GLM approach
// Returns: team attack/defence ratings, home advantage, matches analyzed
async function trainPoissonRatings(
  leagueId: number,
  season: number,
  fromDate?: string,
  toDate?: string
) {
  const fixtures = await fetchHistoricalFixtures(leagueId, season, fromDate, toDate);

  if (fixtures.length === 0) {
    console.warn(
      `No historical fixtures found for league ${leagueId}, season ${season}`
    );
    // Return default ratings if no data available
    return {
      teamRatings: new Map(),
      homeAdvantage: 1.1,
      totalMatches: 0,
    };
  }

  console.log(`Training Poisson ratings on ${fixtures.length} historical matches`);

  // Build long format data: one row per team's goals in a match
  // Each match generates two rows: home team goals (is_home=1) and away team goals (is_home=0)
  const goalRows: Array<{ goals: number; teamId: string; opponentId: string; isHome: number }> = [];
  const teamSet = new Set<string>();

  for (const f of fixtures) {
    const homeTeam = normalizeTeamName(f.teams.home.name);
    const awayTeam = normalizeTeamName(f.teams.away.name);
    const homeGoals = f.goals?.home ?? 0;
    const awayGoals = f.goals?.away ?? 0;

    teamSet.add(homeTeam);
    teamSet.add(awayTeam);

    // Home team row: goals scored when playing at home
    goalRows.push({ goals: homeGoals, teamId: homeTeam, opponentId: awayTeam, isHome: 1 });
    // Away team row: goals scored when playing away
    goalRows.push({ goals: awayGoals, teamId: awayTeam, opponentId: homeTeam, isHome: 0 });
  }

  const totalMatches = fixtures.length;

  // Calculate goals per team (home and away games)
  const teamGoals: Map<string, { homeGoals: number; awayGoals: number; homeGames: number; awayGames: number }> = new Map();

  for (const row of goalRows) {
    const existing = teamGoals.get(row.teamId) || {
      homeGoals: 0,
      awayGoals: 0,
      homeGames: 0,
      awayGames: 0,
    };

    if (row.isHome === 1) {
      existing.homeGoals += row.goals;
      existing.homeGames += 1;
    } else {
      existing.awayGoals += row.goals;
      existing.awayGames += 1;
    }

    teamGoals.set(row.teamId, existing);
  }

  // Calculate league average goals
  const totalGoalsScored = goalRows.reduce((sum, row) => sum + row.goals, 0);
  const leagueAvgGoals = totalGoalsScored / goalRows.length;

  // Calculate home advantage: home teams typically score more
  const homeGoalsRows = goalRows.filter(r => r.isHome === 1);
  const awayGoalsRows = goalRows.filter(r => r.isHome === 0);
  const avgHomeGoals = homeGoalsRows.length > 0
    ? homeGoalsRows.reduce((sum, row) => sum + row.goals, 0) / homeGoalsRows.length
    : leagueAvgGoals;
  const avgAwayGoals = awayGoalsRows.length > 0
    ? awayGoalsRows.reduce((sum, row) => sum + row.goals, 0) / awayGoalsRows.length
    : leagueAvgGoals;
  // Avoid division by zero for home advantage calculation
  const homeAdvantage = avgAwayGoals > 0 ? avgHomeGoals / avgAwayGoals : 1.1;

  // Build team ratings map
  // attack: average goals scored (home teams) / league average
  // defence: average goals conceded (opponents' scoring against) / league average
  const teamAttack: Map<string, number> = new Map();
  const teamConcede: Map<string, number> = new Map();

  for (const row of goalRows) {
    const existingAttack = teamAttack.get(row.teamId) || 0;
    const existingConcede = teamConcede.get(row.teamId) || 0;

    if (row.isHome === 1) {
      teamAttack.set(row.teamId, existingAttack + row.goals);
      teamConcede.set(row.opponentId, existingConcede + row.goals); // opponent conceded these goals
    } else {
      teamAttack.set(row.teamId, existingAttack + row.goals);
      teamConcede.set(row.opponentId, existingConcede + row.goals);
    }
  }

  // Normalize attack and defence ratings
  const teamRatings = new Map<string, {
    homeAttack: number;
    awayAttack: number;
    homeDefence: number;
    awayDefence: number;
    homeAdvantage: number;
    matchesAnalyzed: number;
  }>();

  for (const team of teamSet) {
    const teamHomeGames = teamGoals.get(team)?.homeGames || 0;
    const teamAwayGames = teamGoals.get(team)?.awayGames || 0;
    const teamHomeGoals = teamGoals.get(team)?.homeGoals || 0;
    const teamAwayGoals = teamGoals.get(team)?.awayGoals || 0;
    const gamesPlayed = teamHomeGames + teamAwayGames || 1;
    const avgScoredHome = teamHomeGames > 0 ? teamHomeGoals / teamHomeGames : 0;
    const avgScoredAway = teamAwayGames > 0 ? teamAwayGoals / teamAwayGames : 0;
    const avgConcededHome = teamConcede.get(team) || 0;
    const avgConcededAway = teamConcede.get(team) || 0;

    // Attack rating: goals scored divided by expected (league avg * homeAdvantage if home)
    const attackHome = gamesPlayed > 0 && leagueAvgGoals > 0 ? avgScoredHome / leagueAvgGoals : 1.0;
    const attackAway = gamesPlayed > 0 && leagueAvgGoals > 0 ? avgScoredAway / leagueAvgGoals : 1.0;

    // Defence rating: goals conceded divided by expected
    // Lower is better (concedes less)
    const defenceHome = gamesPlayed > 0 && leagueAvgGoals > 0 ? avgConcededHome / leagueAvgGoals : 1.0;
    const defenceAway = gamesPlayed > 0 && leagueAvgGoals > 0 ? avgConcededAway / leagueAvgGoals : 1.0;

    teamRatings.set(team, {
      homeAttack: attackHome,
      awayAttack: attackAway,
      homeDefence: defenceHome,
      awayDefence: defenceAway,
      homeAdvantage: homeAdvantage,
      matchesAnalyzed: fixtures.length,
    });
  }

  return {
    teamRatings,
    homeAdvantage,
    totalMatches: fixtures.length,
  };
}

// Poisson probability mass function
function poissonPMF(k: number, lambda: number): number {
  if (k < 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

// Factorial (small integers only)
function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// Dixon-Coles adjustment for low scorelines
function dcAdjustment(score1: number, score2: number, lambda1: number, lambda2: number, rho: number): number {
  // rho is the Dixon-Coles correlation parameter (typically -0.12 to -0.15)
  if (score1 === 0 && score2 === 0) return 1 - rho;
  if (score1 === 0 && score2 === 1) return rho;
  if (score1 === 1 && score2 === 0) return rho;
  if (score1 === 1 && score2 === 1) return 1 - rho;
  return 1;
}

// Main prediction function using Poisson + Dixon-Coles
function predictPoissonDC(
  homeTeamName: string,
  awayTeamName: string,
  teamRatings?: Map<string, { homeAttack: number; awayAttack: number; homeDefence: number; awayDefence: number; homeAdvantage: number; matchesAnalyzed: number }>
) {
  // Look up ratings or use defaults
  const homeModel = teamRatings?.get(homeTeamName.toLowerCase()) || {
    homeAttack: 1.2,
    awayAttack: 1.1,
    homeDefence: 0.8,
    awayDefence: 0.9,
    homeAdvantage: 1.1,
    matchesAnalyzed: 0,
  };
  const awayModel = teamRatings?.get(awayTeamName.toLowerCase()) || {
    homeAttack: 1.2,
    awayAttack: 1.1,
    homeDefence: 0.8,
    awayDefence: 0.9,
    homeAdvantage: 1.1,
    matchesAnalyzed: 0,
  };

  // Calculate expected goals
  const lambdaHome = homeModel.homeAttack * awayModel.awayDefence * homeModel.homeAdvantage;
  const lambdaAway = awayModel.awayAttack * homeModel.homeDefence;

  const expectedGoals = { home: lambdaHome, away: lambdaAway };

  // Dixon-Coles rho parameter (adjusts low scorelines)
  const rho = -0.13;

  // Calculate probabilities using Poisson + Dixon-Coles
  // Sum probabilities of all relevant scorelines (0-0 through 3-3)
  let pHomeWin = 0, pDraw = 0, pAwayWin = 0;
  const scorelineProbs: { score: string; probability: number }[] = [];

  for (let h = 0; h <= 4; h++) {
    for (let a = 0; a <= 4; a++) {
      // Base Poisson probability
      const baseProb = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);

      // Dixon-Coles adjustment
      const dcAdj = dcAdjustment(h, a, lambdaHome, lambdaAway, rho);
      const adjProb = baseProb * dcAdj;

      // Accumulate outcome probabilities
      if (h > a) {
        pHomeWin += adjProb;
      } else if (h < a) {
        pAwayWin += adjProb;
      } else {
        pDraw += adjProb;
      }

      // Track top scorelines (limit to 10)
      if (scorelineProbs.length < 10) {
        scorelineProbs.push({ score: `${h}-${a}`, probability: Math.round(adjProb * 10000) / 100 });
      }
    }
  }

  // Normalize probabilities
  const total = pHomeWin + pDraw + pAwayWin;
  const homeWinProb = total > 0 ? Math.round((pHomeWin / total) * 10000) / 100 : 33.33;
  const drawProb = total > 0 ? Math.round((pDraw / total) * 10000) / 100 : 33.33;
  const awayWinProb = total > 0 ? Math.round((pAwayWin / total) * 10000) / 100 : 33.33;

  let predictedWinner = 'draw';
  if (homeWinProb > awayWinProb) predictedWinner = homeTeamName;
  else if (awayWinProb > homeWinProb) predictedWinner = awayTeamName;

  return {
    expectedGoals,
    outcomeProbabilities: { homeWin: homeWinProb, draw: drawProb, awayWin: awayWinProb },
    topScorelines: scorelineProbs.slice(0, 10),
  };
}

// --- VALUE BETTING / PROFITABILITY IDENTIFICATION ---

function oddsToImpliedProb(odds: number): number {
  if (odds <= 0) return 0;
  return 1 / odds;
}

function calculateEV(modelProb: number, odds: number): number {
  if (odds <= 1) return -1;
  const stake = 1;
  const profit = odds - 1;
  const winEV = modelProb * profit;
  const loseEV = (1 - modelProb) * (-stake);
  return winEV + loseEV;
}

function calculateKellyFraction(modelProb: number, odds: number): number {
  if (odds <= 1) return 0;
  const b = odds - 1;
  const p = modelProb;
  const q = 1 - modelProb;
  const f = (b * p - q) / b;
  if (f < 0) return 0;
  return Math.max(0, Math.min(f, 1));
}

interface ValueBet {
  outcome: string;
  modelProbability: number;
  odds: number;
  impliedProbability: number;
  edgePercent: number;
  expectedValue: number;
  kellyFraction: number;
  kellyHalfFraction: number;
  isValueBet: boolean;
  confidence: 'Low' | 'Medium' | 'High';
  recommendedStake?: number;
}

function identifyValueBets(
  modelProbs: { homeWin: number; draw: number; awayWin: number },
  odds?: { home: number; draw: number; away: number },
  bankroll: number = 1000
) {
  if (!odds || odds.home <= 0 || odds.draw <= 0 || odds.away <= 0) {
    return null;
  }

  const outcomes = [
    { name: 'Home Win', model: modelProbs.homeWin / 100, odds: odds.home },
    { name: 'Draw', model: modelProbs.draw / 100, odds: odds.draw },
    { name: 'Away Win', model: modelProbs.awayWin / 100, odds: odds.away },
  ];

  const valueBets: ValueBet[] = outcomes.map(out => {
    const implied = oddsToImpliedProb(out.odds);
    const edge = out.model - implied;
    const ev = calculateEV(out.model, out.odds);
    const kelly = calculateKellyFraction(out.model, out.odds);
    const kellyHalf = kelly * 0.5;
    const isValueBet = ev > 0.01; // EV > 1% minimum threshold
    return {
      outcome: out.name,
      modelProbability: parseFloat((out.model * 100).toFixed(2)),
      odds: out.odds,
      impliedProbability: parseFloat((implied * 100).toFixed(2)),
      edgePercent: parseFloat((edge * 100).toFixed(2)),
      expectedValue: parseFloat(ev.toFixed(4)),
      kellyFraction: parseFloat((kelly * 100).toFixed(2)),
      kellyHalfFraction: parseFloat((kellyHalf * 100).toFixed(2)),
      isValueBet,
      confidence: ev > 0.05 ? 'High' : ev > 0.02 ? 'Medium' : ev > 0.01 ? 'Low' : 'Low',
      recommendedStake: parseFloat((bankroll * kellyHalf).toFixed(2)), // Use fractional Kelly (half-Kelly) for risk management
    };
  });

  const bestValueBet = valueBets
    .filter(v => v.isValueBet)
    .sort((a, b) => b.expectedValue - a.expectedValue)[0];

  return {
    valueBets,
    bestValueBet,
    hasValue: valueBets.some(v => v.isValueBet),
  };
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Sports Prediction API is running' });
});

// Get upcoming matches endpoint
app.get('/matches/upcoming', async (req: Request, res: Response) => {
  try {
    // In a real app, we'd fetch from API-Football
    // For now, return simulated data
    const simulatedMatches: MatchData[] = [
      {
        fixtureId: 1,
        homeTeam: 'Manchester United',
        awayTeam: 'Liverpool',
        status: 'scheduled',
      },
      {
        fixtureId: 2,
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        status: 'scheduled',
      },
    ];

    // Add to matches map for prediction lookups
    simulatedMatches.forEach(match => {
      matches.set(match.fixtureId.toString(), match);
    });

    res.json({ matches: simulatedMatches });
  } catch (error) {
    // TypeScript 'error' in catch is 'unknown'; extract message safely
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

  if (match.status !== 'scheduled') {
    return res.status(400).json({ error: 'Prediction only available for scheduled matches' });
  }

  // Use Poisson + Dixon-Coles model for prediction
  // Train ratings from API-Football historical data (league ID 39 = Premier League, season 2023)
  let prediction;
  try {
    const ratingsResult = await trainPoissonRatings(39, 2023); // Premier League 2023 as default
    prediction = predictPoissonDC(match.homeTeam, match.awayTeam, ratingsResult.teamRatings);
  } catch (err) {
    // TypeScript 'err' is 'unknown' in catch; extract message safely
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error('Error training ratings, using defaults:', errMessage);
    prediction = predictPoissonDC(match.homeTeam, match.awayTeam);
  }

  res.json({
    fixtureId: match?.fixtureId,
    homeTeam: match?.homeTeam,
    awayTeam: match?.awayTeam,
    prediction,
  });
});

// Live stats update endpoint (would be called by a background worker in production)
app.post('/matches/:fixtureId/live-stats', (req: Request, res: Response) => {
  const fixtureId = req.params.fixtureId as string;
  const liveStats = req.body;

  const match = matches.get(fixtureId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  match.liveStats = liveStats;
  match.status = 'live';

  res.json({ success: true, match });
});

// Result prediction endpoint (after match finished)
app.post('/matches/:fixtureId/result', async (req: Request, res: Response) => {
  const fixtureId = req.params.fixtureId as string;
  const { homeGoals, awayGoals } = req.body;

  const match = matches.get(fixtureId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  match.homeGoals = homeGoals;
  match.awayGoals = awayGoals;
  match.status = 'finished';

  // Generate prediction based on actual result for verification
  let prediction;
  try {
    const ratingsResult = await trainPoissonRatings(39, 2023);
    prediction = predictPoissonDC(match.homeTeam, match.awayTeam, ratingsResult.teamRatings);
  } catch (err) {
    // TypeScript 'err' in catch is 'unknown'; extract message safely
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error('Error training ratings, using defaults:', errMessage);
    prediction = predictPoissonDC(match.homeTeam, match.awayTeam);
  }

  res.json({
    fixtureId: match.fixtureId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    actualResult: `${homeGoals}-${awayGoals}`,
    prediction,
  });
});

app.listen(PORT, () => {
  console.log(`Sports Prediction API running on port ${PORT}`);
});