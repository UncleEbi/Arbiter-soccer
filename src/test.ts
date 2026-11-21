// Comprehensive Test & Verification Suite for Arbiter Soccer

import assert from 'assert';
import http from 'http';
import {
  poissonPMF,
  dcAdjustment,
  predictPoissonDC,
  DEFAULT_TEAM_RATINGS,
  LiveStats,
} from './model';
import {
  oddsToImpliedProb,
  calculateEV,
  calculateKellyFraction,
  identifyValueBets,
  evaluateSingleBet,
} from './valueBetting';
import { BankrollJournal } from './journal';
import { runBacktest, SAMPLE_HISTORICAL_MATCHES } from './backtest';
import { app } from './index';

async function runTests() {
  console.log('=== Starting Arbiter Soccer Verification Suite ===\n');

  // Test 1: Poisson PMF math
  console.log('Test 1: Verifying Poisson PMF calculation...');
  const p0 = poissonPMF(0, 1.5);
  const p1 = poissonPMF(1, 1.5);
  const p2 = poissonPMF(2, 1.5);
  assert(p0 > 0 && p0 < 1, 'Poisson P(0) out of range');
  assert(Math.abs(p0 - Math.exp(-1.5)) < 1e-6, 'Poisson P(0) should equal exp(-lambda)');
  assert(Math.abs(p1 - 1.5 * Math.exp(-1.5)) < 1e-6, 'Poisson P(1) formula mismatch');
  console.log('  ✓ Poisson PMF validated');

  // Test 2: Dixon-Coles adjustment
  console.log('Test 2: Verifying Dixon-Coles adjustment factors and non-negativity...');
  const rho = -0.13;
  const lambda1 = 1.6;
  const lambda2 = 1.2;

  const adj00 = dcAdjustment(0, 0, lambda1, lambda2, rho);
  const adj01 = dcAdjustment(0, 1, lambda1, lambda2, rho);
  const adj10 = dcAdjustment(1, 0, lambda1, lambda2, rho);
  const adj11 = dcAdjustment(1, 1, lambda1, lambda2, rho);
  const adj21 = dcAdjustment(2, 1, lambda1, lambda2, rho);

  assert(adj00 > 1.0, '0-0 adjustment with negative rho should increase 0-0 probability');
  assert(adj01 > 0 && adj01 < 1.0, '0-1 adjustment should be strictly positive (preventing negative probabilities)');
  assert(adj10 > 0 && adj10 < 1.0, '1-0 adjustment should be strictly positive (preventing negative probabilities)');
  assert(adj11 > 1.0, '1-1 adjustment should increase 1-1 draw probability');
  assert(adj21 === 1.0, 'Scores > 1-1 must have adjustment factor 1.0');
  console.log(`  ✓ Dixon-Coles factors: (0,0)=${adj00.toFixed(3)}, (0,1)=${adj01.toFixed(3)}, (1,0)=${adj10.toFixed(3)}, (1,1)=${adj11.toFixed(3)}`);

  // Test 3: Match prediction output
  console.log('Test 3: Verifying full match prediction with Poisson + Dixon-Coles...');
  const pred = predictPoissonDC('Manchester City', 'Aston Villa');
  assert(pred.outcomeProbabilities.homeWin > 50, 'Manchester City at home should be favored vs Aston Villa');
  const sumProb = pred.outcomeProbabilities.homeWin + pred.outcomeProbabilities.draw + pred.outcomeProbabilities.awayWin;
  assert(Math.abs(sumProb - 100) < 0.5, `Outcome probabilities must sum to 100%, got ${sumProb}%`);
  assert(pred.expectedGoals.home > pred.expectedGoals.away, 'Home team xG should exceed away team xG');
  assert(pred.topScorelines.length > 0, 'Top scorelines must not be empty');
  assert(pred.homeWinProbability === pred.outcomeProbabilities.homeWin, 'Compatibility flat property homeWinProbability must match');

  // Verify multi-market non-straight-win projections
  assert(pred.doubleChance.homeOrDraw > pred.outcomeProbabilities.homeWin, 'Double chance 1X must exceed straight win prob');
  assert(pred.totals.over15 > 0 && pred.totals.over25 > 0, 'Over 1.5 and 2.5 goals must be calculated');
  assert(pred.btts.yes > 0 && pred.btts.no > 0, 'BTTS probabilities must be calculated');
  assert(pred.drawNoBet.homeDNB > 50, 'Home DNB must be calculated and favored');
  assert(pred.halfTime.htOver05 > 0, 'Half-time projection must be calculated');
  assert(pred.recommendedMarkets.length > 0, 'Recommended markets must be populated');
  console.log(`  ✓ Multi-Market Predictions: 1X=${pred.doubleChance.homeOrDraw}%, Over1.5=${pred.totals.over15}%, Over2.5=${pred.totals.over25}%, BTTS=${pred.btts.yes}%, HomeDNB=${pred.drawNoBet.homeDNB}%`);

  // Test 4: Live stats in-play prediction
  console.log('Test 4: Verifying in-play live stats prediction update...');
  const liveStats: LiveStats = {
    elapsedMinutes: 70,
    homeGoals: 2,
    awayGoals: 0,
    possession: 62,
    shotsOnTarget: 7,
  };
  const livePred = predictPoissonDC('Arsenal', 'Chelsea', undefined, liveStats);
  assert(livePred.outcomeProbabilities.homeWin > 80, 'Team leading 2-0 at 70 mins should have high home win prob');
  assert(livePred.expectedGoals.home >= 2.0, 'Expected goals must include current actual goals scored');
  console.log(`  ✓ In-play (2-0, 70 min): Home Win=${livePred.outcomeProbabilities.homeWin}%, Draw=${livePred.outcomeProbabilities.draw}%, Away Win=${livePred.outcomeProbabilities.awayWin}%`);

  // Test 5: Value Betting & Kelly Staking math
  console.log('Test 5: Verifying Value Betting, EV, and Kelly calculations...');
  const imp50 = oddsToImpliedProb(2.0);
  assert(Math.abs(imp50 - 0.5) < 1e-4, 'Implied prob of 2.0 odds must be 0.5');

  // Model says 60% probability, market gives decimal odds of 2.0 (implied 50%)
  const evPositive = calculateEV(0.60, 2.0);
  // EV = 0.60 * 2.0 - 1 = +0.20 (20% expected return)
  assert(Math.abs(evPositive - 0.20) < 1e-4, `Expected EV 0.20, got ${evPositive}`);

  const kellyFrac = calculateKellyFraction(0.60, 2.0);
  // Full Kelly = (b*p - q)/b = (1 * 0.60 - 0.40)/1 = 0.20 (20%)
  assert(Math.abs(kellyFrac - 0.20) < 1e-4, `Expected Kelly 0.20, got ${kellyFrac}`);

  const singleBet = evaluateSingleBet('1X2', 'Home Win', 60, 2.0, 1000);
  assert(singleBet.isValueBet === true, 'Must identify as value bet');
  assert(singleBet.confidence === 'High', 'EV of 20% must be High confidence');
  // Half Kelly = 10%, capped at max 5% bankroll = $50
  assert(singleBet.recommendedStake === 50, `Expected recommended stake $50, got $${singleBet.recommendedStake}`);
  console.log(`  ✓ EV=${singleBet.expectedValue * 100}%, Half-Kelly Stake=$${singleBet.recommendedStake} (${singleBet.confidence} confidence)`);

  // Test 6: Bankroll Journal & Drawdown calculation
  console.log('Test 6: Verifying Bankroll Journal tracking, settle, and drawdown...');
  const testJournal = new BankrollJournal(1000);
  const bet1 = testJournal.placeBet({
    fixtureId: 1,
    match: 'Team A vs Team B',
    outcome: 'Home Win',
    modelProb: 60,
    odds: 2.0,
    stake: 50,
  });
  assert(testJournal.getBankroll() === 950, 'Bankroll should deduct pending stake');

  testJournal.settleBet(bet1.id, 'won');
  // Won: 950 + 100 = 1050
  assert(testJournal.getBankroll() === 1050, `Bankroll should be 1050, got ${testJournal.getBankroll()}`);

  const bet2 = testJournal.placeBet({
    fixtureId: 2,
    match: 'Team C vs Team D',
    outcome: 'Away Win',
    modelProb: 40,
    odds: 3.0,
    stake: 50,
  });
  testJournal.settleBet(bet2.id, 'lost');
  // Lost: bankroll drops from 1050 to 1000
  assert(testJournal.getBankroll() === 1000, `Bankroll should be 1000, got ${testJournal.getBankroll()}`);

  const stats = testJournal.getStats();
  assert(stats.totalBets === 2, 'Total bets should be 2');
  assert(stats.winRate === 50, 'Win rate should be 50%');
  assert(stats.maxDrawdownAmount === 50, `Max drawdown amount should be $50, got ${stats.maxDrawdownAmount}`);
  assert(stats.brierScore !== null && stats.brierScore >= 0, 'Brier score calibration should be computed');
  console.log(`  ✓ Journal stats: Bankroll=$${stats.currentBankroll}, ROI=${stats.roiPercent}%, WinRate=${stats.winRate}%, MaxDrawdown=$${stats.maxDrawdownAmount}, BrierScore=${stats.brierScore}`);

  // Test 7: Backtest simulation engine
  console.log('Test 7: Verifying Backtesting simulation engine...');
  const backtestResult = runBacktest({
    strategy: 'half-kelly',
    initialBankroll: 1000,
    minEdgePercent: 1.5,
  });
  assert(backtestResult.betsPlaced > 0, 'Backtest must place bets on value opportunities');
  assert(backtestResult.equityCurve.length === backtestResult.betsPlaced + 1, 'Equity curve must match bet count');
  assert(backtestResult.brierScore > 0 && backtestResult.brierScore < 1, 'Brier score must be within [0, 1]');
  console.log(`  ✓ Backtest on ${backtestResult.totalMatchesAnalyzed} matches: Bets Placed=${backtestResult.betsPlaced}, WinRate=${backtestResult.winRate}%, NetProfit=$${backtestResult.netProfit}, MaxDD=${backtestResult.maxDrawdownPercent}%, Brier=${backtestResult.brierScore}`);

  // Test 8: End-to-End HTTP Endpoints
  console.log('\nTest 8: Running live HTTP requests against local Express API server...');
  const testPort = 3999;
  const server = app.listen(testPort);

  try {
    const fetchJson = (path: string, options: { method?: string; body?: any } = {}): Promise<any> => {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://localhost:${testPort}${path}`,
          {
            method: options.method || 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve({ status: res.statusCode, data: parsed });
              } catch (e) {
                resolve({ status: res.statusCode, raw: data });
              }
            });
          }
        );
        req.on('error', reject);
        if (options.body) {
          req.write(JSON.stringify(options.body));
        }
        req.end();
      });
    };

    // GET /health
    const health = await fetchJson('/health');
    assert(health.status === 200 && health.data.status === 'ok', 'GET /health failed');
    console.log('  ✓ GET /health responded 200 OK');

    // GET /matches/upcoming
    const upcoming = await fetchJson('/matches/upcoming');
    assert(upcoming.status === 200 && upcoming.data.matches.length >= 2, 'GET /matches/upcoming failed');
    assert(upcoming.data.matches[0].kickoffDate, 'Kickoff date must be present in upcoming matches');
    console.log(`  ✓ GET /matches/upcoming returned ${upcoming.data.matches.length} matches with kickoff dates`);

    // GET /matches/predictions (All multi-market predictions)
    const allPredictionsRes = await fetchJson('/matches/predictions');
    assert(allPredictionsRes.status === 200 && allPredictionsRes.data.total >= 2, 'GET /matches/predictions failed');
    assert(allPredictionsRes.data.predictions[0].prediction.doubleChance, 'Multi-market double chance prediction must be present');
    console.log(`  ✓ GET /matches/predictions returned multi-market projections for ${allPredictionsRes.data.total} fixtures`);

    // POST /matches/1/odds
    const updateOdds = await fetchJson('/matches/1/odds', {
      method: 'POST',
      body: { home: 3.10, draw: 3.75, away: 2.15, over25: 1.65, under25: 2.20 },
    });
    assert(updateOdds.status === 200 && updateOdds.data.success === true, 'POST /matches/1/odds failed');
    console.log('  ✓ POST /matches/1/odds updated match odds');

    // GET /matches/1/prediction
    const predictionRes = await fetchJson('/matches/1/prediction');
    assert(predictionRes.status === 200 && predictionRes.data.prediction, 'GET /matches/1/prediction failed');
    assert(predictionRes.data.valueBetting !== null, 'Value betting analysis should be attached when odds are present');
    console.log(`  ✓ GET /matches/1/prediction returned prediction and value analysis (hasValue=${predictionRes.data.valueBetting?.hasValue})`);

    // GET /matches/value-bets
    const valueBetsRes = await fetchJson('/matches/value-bets');
    assert(valueBetsRes.status === 200 && Array.isArray(valueBetsRes.data.opportunities), 'GET /matches/value-bets failed');
    console.log(`  ✓ GET /matches/value-bets identified ${valueBetsRes.data.opportunities.length} value opportunities`);

    // POST /matches/1/live-stats
    const liveStatsRes = await fetchJson('/matches/1/live-stats', {
      method: 'POST',
      body: { possession: 58, shots: 12, shotsOnTarget: 5, homeGoals: 1, awayGoals: 0, elapsedMinutes: 55 },
    });
    assert(liveStatsRes.status === 200 && liveStatsRes.data.livePrediction, 'POST /matches/1/live-stats failed');
    console.log('  ✓ POST /matches/1/live-stats returned updated live prediction');

    // POST /bets (Place bet)
    const placeBetRes = await fetchJson('/bets', {
      method: 'POST',
      body: {
        fixtureId: 1,
        match: 'Manchester United vs Liverpool',
        outcome: 'Home Win',
        modelProb: 35.0,
        odds: 3.10,
        stake: 25.0,
      },
    });
    assert(placeBetRes.status === 200 && placeBetRes.data.bet?.id, 'POST /bets failed');
    const betId = placeBetRes.data.bet.id;
    console.log(`  ✓ POST /bets placed bet ${betId}`);

    // GET /bets
    const getBetsRes = await fetchJson('/bets');
    assert(getBetsRes.status === 200 && getBetsRes.data.count >= 1, 'GET /bets failed');
    console.log(`  ✓ GET /bets returned ${getBetsRes.data.count} bets`);

    // POST /matches/1/result (auto-settles bet)
    const resultRes = await fetchJson('/matches/1/result', {
      method: 'POST',
      body: { homeGoals: 2, awayGoals: 1 },
    });
    assert(resultRes.status === 200 && resultRes.data.settledBetsCount >= 1, 'POST /matches/1/result auto-settle failed');
    console.log(`  ✓ POST /matches/1/result settled bet with score 2-1 (Bankroll: $${resultRes.data.bankrollAfter})`);

    // GET /journal/stats
    const journalStats = await fetchJson('/journal/stats');
    assert(journalStats.status === 200 && journalStats.data.settledBets >= 1, 'GET /journal/stats failed');
    console.log(`  ✓ GET /journal/stats returned NetProfit=$${journalStats.data.netProfit}, WinRate=${journalStats.data.winRate}%`);

    // POST /backtest
    const backtestApiRes = await fetchJson('/backtest', {
      method: 'POST',
      body: { strategy: 'half-kelly', initialBankroll: 1000 },
    });
    assert(backtestApiRes.status === 200 && backtestApiRes.data.result?.betsPlaced > 0, 'POST /backtest failed');
    console.log(`  ✓ POST /backtest simulated ${backtestApiRes.data.result.betsPlaced} bets with ROI ${backtestApiRes.data.result.roiPercent}%`);

    // Option 1: Live Feed Ingestion Endpoints
    const feedStatus = await fetchJson('/api/feed/status');
    assert(feedStatus.status === 200 && feedStatus.data.activeProvider, 'GET /api/feed/status failed');
    console.log(`  ✓ GET /api/feed/status verified (Active Provider: ${feedStatus.data.activeProvider})`);

    const feedSync = await fetchJson('/api/feed/sync', { method: 'POST', body: { provider: 'simulation' } });
    assert(feedSync.status === 200 && feedSync.data.success, 'POST /api/feed/sync failed');
    console.log(`  ✓ POST /api/feed/sync verified (${feedSync.data.result.message})`);

    // Option 3: Dynamic Bayesian Rating Endpoints
    const ratingsRes = await fetchJson('/ratings/teams');
    assert(ratingsRes.status === 200 && ratingsRes.data.total > 0, 'GET /ratings/teams failed');
    console.log(`  ✓ GET /ratings/teams returned ${ratingsRes.data.total} dynamic team ratings`);

    const teamHistoryRes = await fetchJson('/ratings/teams/manchester%20united/history');
    assert(teamHistoryRes.status === 200 && teamHistoryRes.data.history.length > 0, 'GET /ratings/teams/:team/history failed');
    console.log(`  ✓ GET /ratings/teams/manchester united/history verified (${teamHistoryRes.data.history.length} data points)`);

    // Option 4: Model Calibration & Reliability Endpoints
    const calibMetrics = await fetchJson('/calibration/metrics');
    assert(calibMetrics.status === 200 && calibMetrics.data.totalPredictions > 0, 'GET /calibration/metrics failed');
    assert(calibMetrics.data.bins.length === 10, 'Reliability diagram must have 10 decile bins');
    console.log(`  ✓ GET /calibration/metrics verified: ECE=${calibMetrics.data.expectedCalibrationError}%, Brier=${calibMetrics.data.brierScore}, Quality=${calibMetrics.data.calibrationQuality}`);

    // Option 5: Daily Digest & Export Endpoints
    const digestRes = await fetchJson('/digest/daily');
    assert(digestRes.status === 200 && digestRes.data.topBankerPicks, 'GET /digest/daily failed');
    console.log(`  ✓ GET /digest/daily generated brief with ${digestRes.data.topBankerPicks.length} banker picks`);

    const exportCsvRes = await fetchJson('/export/csv');
    assert(exportCsvRes.status === 200 && typeof exportCsvRes.raw === 'string' && exportCsvRes.raw.includes('Fixture ID'), 'GET /export/csv failed');
    console.log('  ✓ GET /export/csv returned formatted CSV data');

    const exportJsonRes = await fetchJson('/export/json');
    assert(exportJsonRes.status === 200 && exportJsonRes.data.totalMatches > 0, 'GET /export/json failed');
    console.log(`  ✓ GET /export/json returned ${exportJsonRes.data.totalMatches} matches`);
  } finally {
    server.close();
  }

  console.log('\n=== All Tests Passed Successfully! ===');
}

runTests().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
