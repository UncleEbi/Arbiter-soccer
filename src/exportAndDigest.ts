// Automated Daily Match Previews, Statistical Ranking, CSV/JSON Exporters & Webhook Dispatcher

import axios from 'axios';
import { MatchData } from './fixtures';
import { computeMatchPrediction } from './index';
import { SportType } from './model';

export interface BankerPick {
  fixtureId: number;
  match: string;
  sport: SportType;
  league: string;
  kickoffDate: string;
  market: string;
  prediction: string;
  probability: number;
  confidence: 'Very High' | 'High';
  reasoning: string;
}

export interface ValueAnomalyPick {
  fixtureId: number;
  match: string;
  sport: SportType;
  league: string;
  market: string;
  prediction: string;
  modelProb: number;
  marketOdds: number;
  impliedProb: number;
  edgePercent: number;
}

export interface DailyDigestReport {
  generatedAt: string;
  targetDate: string;
  totalMatchesAnalyzed: number;
  sportsIncluded: SportType[];
  topBankerPicks: BankerPick[];
  topValueAnomalies: ValueAnomalyPick[];
  tacticalKeyAlerts: Array<{ match: string; alert: string }>;
  markdownBrief: string;
}

export function generateDailyDigest(
  matchesList: MatchData[],
  targetDate: string = new Date().toISOString().split('T')[0]
): DailyDigestReport {
  const bankerPicks: BankerPick[] = [];
  const valueAnomalies: ValueAnomalyPick[] = [];
  const tacticalAlerts: Array<{ match: string; alert: string }> = [];
  const sportsSet = new Set<SportType>();

  for (const match of matchesList) {
    sportsSet.add(match.sport);
    const pred = computeMatchPrediction(match);

    // 1. Extract Banker Picks (Confidence >= High or Prob >= 70%)
    for (const rec of pred.recommendedMarkets || []) {
      if (rec.probability >= 70 || rec.confidence === 'Very High') {
        bankerPicks.push({
          fixtureId: match.fixtureId,
          match: `${match.homeTeam} vs ${match.awayTeam}`,
          sport: match.sport,
          league: match.league,
          kickoffDate: match.kickoffDate,
          market: rec.market,
          prediction: rec.prediction,
          probability: rec.probability,
          confidence: rec.confidence as 'Very High' | 'High',
          reasoning: rec.reasoning,
        });
      }
    }

    // 2. Extract Value Anomalies
    if (match.odds && pred.outcomeProbabilities) {
      const outcomes = [
        { name: `${match.homeTeam} Win`, prob: pred.outcomeProbabilities.homeWin, odds: match.odds.home },
        { name: 'Draw', prob: pred.outcomeProbabilities.draw, odds: match.odds.draw },
        { name: `${match.awayTeam} Win`, prob: pred.outcomeProbabilities.awayWin, odds: match.odds.away },
      ];
      for (const o of outcomes) {
        if (o.odds && o.odds > 1) {
          const implied = (1 / o.odds) * 100;
          const edge = o.prob - implied;
          if (edge >= 4.0) {
            valueAnomalies.push({
              fixtureId: match.fixtureId,
              match: `${match.homeTeam} vs ${match.awayTeam}`,
              sport: match.sport,
              league: match.league,
              market: '1X2 / Match Winner',
              prediction: o.name,
              modelProb: parseFloat(o.prob.toFixed(1)),
              marketOdds: o.odds,
              impliedProb: parseFloat(implied.toFixed(1)),
              edgePercent: parseFloat(edge.toFixed(1)),
            });
          }
        }
      }
    }

    // 3. Extract Tactical Lineup Alerts
    for (const note of pred.keyInsights || []) {
      if (/Lineup Alert|missing|H2H|Goalies:/i.test(note)) {
        tacticalAlerts.push({ match: `${match.homeTeam} vs ${match.awayTeam}`, alert: note });
      }
    }
  }

  bankerPicks.sort((a, b) => b.probability - a.probability);
  valueAnomalies.sort((a, b) => b.edgePercent - a.edgePercent);

  const mdLines = [
    `# 🏆 Arbiter Intelligence Daily Sports Digest — ${targetDate}`,
    `*Generated automatically on ${new Date().toUTCString()}*`,
    `*Total Fixtures Analyzed: ${matchesList.length} across ${Array.from(sportsSet).join(', ').toUpperCase()}*`,
    '',
    '## 🎯 Top High-Confidence Statistical Bankers',
    ...bankerPicks.slice(0, 5).map((b, idx) =>
      `${idx + 1}. **${b.match}** (${b.league} - ${b.sport.toUpperCase()})\n   • Market: **${b.market}** ➔ **${b.prediction}**\n   • Model Confidence: **${b.probability}%** (${b.confidence})\n   • Analysis: ${b.reasoning}`
    ),
    '',
    '## 📊 Key Value & Probability Discrepancies',
    ...valueAnomalies.slice(0, 5).map((v, idx) =>
      `${idx + 1}. **${v.match}** — **${v.prediction}**\n   • Model Projected Win Prob: **${v.modelProb}%** vs Market Implied: **${v.impliedProb}%** (Odds: ${v.marketOdds})\n   • Statistical Edge: **+${v.edgePercent}%**`
    ),
    '',
    '## 👥 Key Lineup & Absentees Intelligence',
    ...tacticalAlerts.slice(0, 5).map((t) => `• **${t.match}**: ${t.alert}`),
    '',
    '---',
    '*(Powered by Dixon-Coles Bivariate Poisson, NBA Possession Pace & ATP Markov Chain Statistical Engines)*',
  ];

  return {
    generatedAt: new Date().toISOString(),
    targetDate,
    totalMatchesAnalyzed: matchesList.length,
    sportsIncluded: Array.from(sportsSet),
    topBankerPicks: bankerPicks.slice(0, 8),
    topValueAnomalies: valueAnomalies.slice(0, 8),
    tacticalKeyAlerts: tacticalAlerts.slice(0, 8),
    markdownBrief: mdLines.join('\n'),
  };
}

function extractPredictionProbabilities(pred: any, sport: SportType) {
  switch (sport) {
    case 'basketball':
      return {
        homeProb: pred.moneylineProbabilities?.homeWin ?? 0,
        drawProb: 0,
        awayProb: pred.moneylineProbabilities?.awayWin ?? 0,
        expScore: `${pred.expectedPoints?.home ?? 0} - ${pred.expectedPoints?.away ?? 0}`,
        topScore: '',
        overProb: pred.totals?.overProb ? `Over ${pred.totals.line} (${pred.totals.overProb}%)` : '',
        bttsProb: '',
      };
    case 'hockey':
      return {
        homeProb: pred.moneylineOverall?.homeWin ?? 0,
        drawProb: pred.regulation60m?.draw ?? 0,
        awayProb: pred.moneylineOverall?.awayWin ?? 0,
        expScore: `${pred.expectedGoals?.home ?? 0} - ${pred.expectedGoals?.away ?? 0}`,
        topScore: '',
        overProb: pred.totals?.over55 ? `Over 5.5 (${pred.totals.over55}%)` : '',
        bttsProb: '',
      };
    case 'tennis':
      return {
        homeProb: pred.matchWinner?.player1Prob ?? 0,
        drawProb: 0,
        awayProb: pred.matchWinner?.player2Prob ?? 0,
        expScore: `${pred.predictedWinner} (${Math.max(pred.matchWinner?.player1Prob ?? 0, pred.matchWinner?.player2Prob ?? 0)}%)`,
        topScore: '',
        overProb: pred.totalGames?.overProb ? `Over ${pred.totalGames.line} (${pred.totalGames.overProb}%)` : '',
        bttsProb: '',
      };
    default:
      return {
        homeProb: pred.outcomeProbabilities?.homeWin ?? 0,
        drawProb: pred.outcomeProbabilities?.draw ?? 0,
        awayProb: pred.outcomeProbabilities?.awayWin ?? 0,
        expScore: `${pred.expectedGoals?.home ?? 0} - ${pred.expectedGoals?.away ?? 0}`,
        topScore: pred.topScorelines?.[0] ? `${pred.topScorelines[0].score} (${pred.topScorelines[0].probability}%)` : '',
        overProb: pred.totals?.over25 ? `${pred.totals.over25}%` : '',
        bttsProb: pred.btts?.yes ? `${pred.btts.yes}%` : '',
      };
  }
}

export function exportMatchesToCSV(matchesList: MatchData[]): string {
  const headers = [
    'Fixture ID', 'Sport', 'Country', 'League', 'Kickoff (UTC)', 'Status',
    'Home Team', 'Away Team', 'Venue', 'Predicted Winner', 'Confidence',
    'Home Win % / P1 %', 'Draw % / Tie %', 'Away Win % / P2 %',
    'Expected Score / Goals', 'Top Scoreline', 'Over 2.5 % / Game Total Line',
    'BTTS Yes %', 'Home Form', 'Away Form',
  ];

  const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const rows = matchesList.map((m) => {
    const pred = computeMatchPrediction(m);
    const p = extractPredictionProbabilities(pred, m.sport);
    return [
      escapeCSV(m.fixtureId),
      escapeCSV(m.sport),
      escapeCSV(m.country),
      escapeCSV(m.league),
      escapeCSV(m.kickoffDate),
      escapeCSV(m.status),
      escapeCSV(m.homeTeam),
      escapeCSV(m.awayTeam),
      escapeCSV(m.venue),
      escapeCSV(pred.predictedWinner || 'N/A'),
      escapeCSV(pred.confidenceRating || 'Moderate'),
      escapeCSV(p.homeProb),
      escapeCSV(p.drawProb),
      escapeCSV(p.awayProb),
      escapeCSV(p.expScore),
      escapeCSV(p.topScore),
      escapeCSV(p.overProb),
      escapeCSV(p.bttsProb),
      escapeCSV(m.stats?.homeForm ? m.stats.homeForm.join(' ') : ''),
      escapeCSV(m.stats?.awayForm ? m.stats.awayForm.join(' ') : ''),
    ].join(',');
  });

  return [headers.map(escapeCSV).join(','), ...rows].join('\n');
}

export function exportMatchesToJSON(matchesList: MatchData[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      totalMatches: matchesList.length,
      matches: matchesList.map((m) => ({ ...m, prediction: computeMatchPrediction(m) })),
    },
    null,
    2
  );
}

export async function dispatchWebhook(
  webhookUrl: string,
  digest: DailyDigestReport
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const payload = {
      content: `📢 **Arbiter Intelligence Sports Digest** (${digest.targetDate})`,
      embeds: [
        {
          title: `Daily Predictive Brief — ${digest.targetDate}`,
          description: `Analyzed ${digest.totalMatchesAnalyzed} matches across ${digest.sportsIncluded.join(', ').toUpperCase()}`,
          color: 0x3b82f6,
          fields: [
            {
              name: '🎯 Top High-Confidence Bankers',
              value: digest.topBankerPicks.slice(0, 3).map((b) => `• **${b.match}**: ${b.prediction} (${b.probability}%)`).join('\n') || 'None today',
            },
            {
              name: '📊 Top Value Anomalies',
              value: digest.topValueAnomalies.slice(0, 3).map((v) => `• **${v.match}**: ${v.prediction} (+${v.edgePercent}% edge)`).join('\n') || 'None today',
            },
          ],
          footer: { text: 'Arbiter Multi-Sport Statistical Engine' },
        },
      ],
    };

    const resp = await axios.post(webhookUrl, payload, { timeout: 5000 });
    return { success: true, status: resp.status };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
