import React, { useState, useEffect } from 'react';
import axios from 'axios';

type SportType = 'soccer' | 'basketball' | 'hockey' | 'tennis';

interface Scoreline {
  score: string;
  probability: number;
}

interface RecommendedMarket {
  market: string;
  prediction: string;
  probability: number;
  confidence: 'Very High' | 'High' | 'Moderate';
  reasoning: string;
}

interface PredictionData {
  sport?: SportType;
  expectedGoals?: { home: number; away: number; total: number };
  expectedPoints?: { home: number; away: number; total: number };
  outcomeProbabilities?: { homeWin: number; draw: number; awayWin: number };
  doubleChance?: { homeOrDraw: number; homeOrAway: number; drawOrAway: number };
  totals?: any;
  btts?: { yes: number; no: number };
  drawNoBet?: { homeDNB: number; awayDNB: number };
  cleanSheets?: { homeCleanSheet: number; awayCleanSheet: number; homeToScore: number; awayToScore: number };
  halfTime?: { htHomeWin: number; htDraw: number; htAwayWin: number; htOver05: number; htUnder05: number };
  topScorelines?: Scoreline[];
  // Basketball specific
  spreadPrediction?: { favoredTeam: string; projectedSpread: number; coverProbabilities: { homeCover: number; awayCover: number } };
  moneylineProbabilities?: { homeWin: number; awayWin: number };
  quarters?: { q1Expected: any; firstHalfExpected: any };
  // Hockey specific
  regulation60m?: { homeWin: number; draw: number; awayWin: number };
  moneylineOverall?: { homeWin: number; awayWin: number };
  puckLine?: { homeCover15: number; awayCover15: number };
  // Tennis specific
  matchWinner?: { player1Prob: number; player2Prob: number };
  setBetting?: { twoZero: number; twoOne: number; oneTwo: number; zeroTwo: number };
  totalGames?: { line: number; overProb: number; underProb: number };
  firstSetWinner?: { player1Prob: number; player2Prob: number };

  predictedWinner: string;
  confidenceRating: 'Very High' | 'High' | 'Moderate' | 'Low (Toss-up)';
  recommendedMarkets: RecommendedMarket[];
  keyInsights: string[];
}

interface TeamLineupInfo {
  formation: string;
  status: 'Confirmed' | 'Predicted';
  keyPlayers: string[];
  absentees: string[];
  tacticalStyle: string;
}

interface MatchStatsInfo {
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

interface Match {
  fixtureId: number;
  sport: SportType;
  country: string;
  homeTeam: string;
  awayTeam: string;
  kickoffDate: string;
  league: string;
  venue: string;
  round?: string;
  status: 'scheduled' | 'live' | 'finished';
  lineupInfo?: {
    home: TeamLineupInfo;
    away: TeamLineupInfo;
  };
  stats?: MatchStatsInfo;
}

// Option 1: Live Feed Status
interface FeedStatusData {
  activeProvider: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalSec: number;
  lastSyncTimestamp: string | null;
  lastSyncResult: {
    source: string;
    fixturesAdded: number;
    fixturesUpdated: number;
    message: string;
  } | null;
  totalManagedFixtures: number;
  availableProviders: Array<{ id: string; name: string; requiresKey: boolean; hasKeyConfigured: boolean }>;
}

// Option 3: Dynamic Bayesian Ratings
interface DynamicRatingItem {
  team: string;
  normalizedName: string;
  sport: SportType;
  homeAttack: number;
  awayAttack: number;
  homeDefence: number;
  awayDefence: number;
  homeAdvantage: number;
  matchesAnalyzed: number;
  lastUpdated: string;
  formTrend: 'improving' | 'declining' | 'stable';
  history: Array<{
    date: string;
    opponent: string;
    venue: 'home' | 'away';
    score: string;
    attackRating: number;
    defenceRating: number;
    deltaAttack: number;
    deltaDefence: number;
  }>;
}

// Option 4: Calibration Metrics
interface CalibrationBin {
  binIndex: number;
  range: string;
  minProb: number;
  maxProb: number;
  sampleCount: number;
  predictedAvg: number;
  empiricalWinRate: number;
  calibrationGap: number;
  status: 'well-calibrated' | 'overconfident' | 'underconfident' | 'sparse';
}

interface CalibrationMetricsData {
  totalPredictions: number;
  brierScore: number;
  brierSkillScore: number;
  expectedCalibrationError: number;
  maxCalibrationError: number;
  logLoss: number;
  calibrationQuality: 'Exceptional' | 'Strong' | 'Moderate' | 'Needs Tuning';
  bins: CalibrationBin[];
  bySport: Record<string, { count: number; brierScore: number; ece: number }>;
}

// Option 5: Daily Digest
interface DailyDigestData {
  generatedAt: string;
  targetDate: string;
  totalMatchesAnalyzed: number;
  sportsIncluded: SportType[];
  topBankerPicks: Array<{
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
  }>;
  topValueAnomalies: Array<{
    fixtureId: number;
    match: string;
    sport: SportType;
    league: string;
    prediction: string;
    modelProb: number;
    marketOdds: number;
    impliedProb: number;
    edgePercent: number;
  }>;
  tacticalKeyAlerts: Array<{ match: string; alert: string }>;
  markdownBrief: string;
}

function getApiBase(): string {
  if (typeof window !== 'undefined') {
    if (window.location.port === '5000') return '';
    return process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname || 'localhost'}:5000`;
  }
  return 'http://localhost:5000';
}

async function apiGet<T = any>(endpoint: string): Promise<T> {
  const base = getApiBase();
  try {
    const res = await axios.get(`${base}${endpoint}`, { timeout: 8000 });
    return res.data;
  } catch (err: any) {
    if (base.includes('localhost')) {
      const fallback = base.replace('localhost', '127.0.0.1');
      const res = await axios.get(`${fallback}${endpoint}`, { timeout: 8000 });
      return res.data;
    }
    throw err;
  }
}

async function apiPost<T = any>(endpoint: string, body?: any): Promise<T> {
  const base = getApiBase();
  try {
    const res = await axios.post(`${base}${endpoint}`, body, { timeout: 8000 });
    return res.data;
  } catch (err: any) {
    if (base.includes('localhost')) {
      const fallback = base.replace('localhost', '127.0.0.1');
      const res = await axios.post(`${fallback}${endpoint}`, body, { timeout: 8000 });
      return res.data;
    }
    throw err;
  }
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return isoString;
  }
}

function getSportEmoji(sport: SportType): string {
  switch (sport) {
    case 'basketball': return '🏀';
    case 'hockey': return '🏒';
    case 'tennis': return '🎾';
    default: return '⚽';
  }
}

function getCountryFlag(country: string): string {
  switch (country.toLowerCase()) {
    case 'england': return '🏴󠁧󠁢󠁥󠁮󠁧󠁿';
    case 'spain': return '🇪🇸';
    case 'italy': return '🇮🇹';
    case 'germany': return '🇩🇪';
    case 'france': return '🇫🇷';
    case 'usa': return '🇺🇸';
    case 'brazil': return '🇧🇷';
    case 'saudi arabia': return '🇸🇦';
    default: return '🌐';
  }
}

function App() {
  const [tab, setTab] = useState<'fixtures' | 'matrix' | 'lineups' | 'feeds' | 'ratings' | 'calibration' | 'digest' | 'accuracy'>('fixtures');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');

  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<number, PredictionData>>({});
  const [selectedFixtureId, setSelectedFixtureId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Option 1 State: Live Feeds
  const [feedStatus, setFeedStatus] = useState<FeedStatusData | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [footballDataKey, setFootballDataKey] = useState('');
  const [apiFootballKey, setApiFootballKey] = useState('');

  // Option 3 State: Dynamic Ratings
  const [ratingsList, setRatingsList] = useState<DynamicRatingItem[]>([]);
  const [selectedTeamHistory, setSelectedTeamHistory] = useState<DynamicRatingItem | null>(null);
  const [ratingsSportFilter, setRatingsSportFilter] = useState<string>('all');

  // Option 4 State: Calibration Metrics
  const [calibrationData, setCalibrationData] = useState<CalibrationMetricsData | null>(null);
  const [calibrationSportFilter, setCalibrationSportFilter] = useState<string>('all');

  // Option 5 State: Daily Digest
  const [digestData, setDigestData] = useState<DailyDigestData | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [copiedBrief, setCopiedBrief] = useState(false);

  useEffect(() => {
    fetchMatchesAndPredictions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSport, selectedCountry]);

  useEffect(() => {
    if (tab === 'feeds') fetchFeedStatus();
    if (tab === 'ratings') fetchRatings();
    if (tab === 'calibration') fetchCalibration();
    if (tab === 'digest') fetchDailyDigest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fetchMatchesAndPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiGet(`/matches/predictions?sport=${selectedSport}&country=${selectedCountry}`);

      const list = res.predictions.map((p: any) => ({
        fixtureId: p.fixtureId,
        sport: p.sport || 'soccer',
        country: p.country || 'International',
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        kickoffDate: p.kickoffDate,
        league: p.league,
        venue: p.venue,
        status: p.status,
        lineupInfo: p.lineupInfo,
        stats: p.stats,
      }));
      setMatches(list);

      const preds: Record<number, PredictionData> = {};
      res.predictions.forEach((p: any) => {
        preds[p.fixtureId] = p.prediction;
      });
      setPredictions(preds);

      if (list.length > 0) {
        setSelectedFixtureId((prev) => (prev && list.some((m: any) => m.fixtureId === prev) ? prev : list[0].fixtureId));
      } else {
        setSelectedFixtureId(null);
      }
    } catch (err: any) {
      setError(`Failed to retrieve predictions: ${err.message}. Please click Refresh.`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedStatus = async () => {
    try {
      const data = await apiGet('/api/feed/status');
      setFeedStatus(data);
    } catch (err: any) {
      console.error('Error fetching feed status:', err);
    }
  };

  const triggerLiveSync = async (provider?: string) => {
    try {
      setSyncing(true);
      setSyncMessage(null);
      const res = await apiPost('/api/feed/sync', { provider });
      setSyncMessage(res.result?.message || 'Sync successful');
      await fetchFeedStatus();
      await fetchMatchesAndPredictions();
    } catch (err: any) {
      setSyncMessage(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const saveFeedKeys = async () => {
    try {
      await apiPost('/api/feed/config', {
        footballDataApiKey: footballDataKey || undefined,
        apiFootballApiKey: apiFootballKey || undefined,
      });
      alert('API keys updated successfully!');
      fetchFeedStatus();
    } catch (err: any) {
      alert(`Failed to save keys: ${err.message}`);
    }
  };

  const fetchRatings = async () => {
    try {
      const data = await apiGet(`/ratings/teams?sport=${ratingsSportFilter}`);
      setRatingsList(data.ratings || []);
    } catch (err: any) {
      console.error('Error fetching ratings:', err);
    }
  };

  const fetchCalibration = async () => {
    try {
      const data = await apiGet(`/calibration/metrics?sport=${calibrationSportFilter}`);
      setCalibrationData(data);
    } catch (err: any) {
      console.error('Error fetching calibration:', err);
    }
  };

  const fetchDailyDigest = async () => {
    try {
      const data = await apiGet('/digest/daily');
      setDigestData(data);
    } catch (err: any) {
      console.error('Error fetching daily digest:', err);
    }
  };

  const sendWebhookTest = async () => {
    if (!webhookUrl) return;
    try {
      setWebhookStatus('Dispatching webhook brief...');
      const res = await apiPost('/export/webhook', { webhookUrl });
      if (res.success) {
        setWebhookStatus('✅ Successfully dispatched daily briefing to webhook!');
      } else {
        setWebhookStatus(`❌ Webhook error: ${res.error || 'Failed'}`);
      }
    } catch (err: any) {
      setWebhookStatus(`❌ Webhook failed: ${err.message}`);
    }
  };

  const copyBriefToClipboard = () => {
    if (digestData?.markdownBrief) {
      navigator.clipboard.writeText(digestData.markdownBrief);
      setCopiedBrief(true);
      setTimeout(() => setCopiedBrief(false), 2500);
    }
  };

  const selectedMatch = matches.find((m) => m.fixtureId === selectedFixtureId) || matches[0];
  const selectedPred = selectedMatch ? predictions[selectedMatch.fixtureId] : null;

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1e293b', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
              <span>🌐</span> Multi-Sport & Global Analytics Intelligence
            </div>
            <h1 style={{ margin: 0, fontSize: '28px', color: '#0f172a', fontWeight: '800' }}>
              Arbiter Sports Analytics
            </h1>
            <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: '14px', maxWidth: '820px' }}>
              Pure statistical prediction & calibration platform covering <strong>Football, Basketball (NBA), Ice Hockey (NHL), and Tennis (ATP)</strong>. Features live feed ingestion, dynamic Bayesian ratings, and empirical calibration diagrams.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => {
                fetchMatchesAndPredictions();
                if (tab === 'feeds') fetchFeedStatus();
                if (tab === 'ratings') fetchRatings();
                if (tab === 'calibration') fetchCalibration();
                if (tab === 'digest') fetchDailyDigest();
              }}
              style={{ padding: '10px 18px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🔄 Refresh Dashboard
            </button>
          </div>
        </div>

        {/* Global Sports & Country Filter Bar */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Sport:</span>
            {[
              { id: 'all', label: '🌍 All Sports' },
              { id: 'soccer', label: '⚽ Football / Soccer' },
              { id: 'basketball', label: '🏀 Basketball (NBA)' },
              { id: 'hockey', label: '🏒 Ice Hockey (NHL)' },
              { id: 'tennis', label: '🎾 Tennis (ATP)' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSport(s.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: selectedSport === s.id ? '2px solid #0284c7' : '1px solid #cbd5e0',
                  background: selectedSport === s.id ? '#e0f2fe' : '#ffffff',
                  color: selectedSport === s.id ? '#0369a1' : '#475569',
                  fontWeight: selectedSport === s.id ? '700' : '500',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>Country/Region:</span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px', background: '#fff' }}
            >
              <option value="all">🌍 All Countries</option>
              <option value="England">🏴󠁧󠁢󠁥󠁮󠁧󠁿 England</option>
              <option value="Spain">🇪🇸 Spain</option>
              <option value="Italy">🇮🇹 Italy</option>
              <option value="Germany">🇩🇪 Germany</option>
              <option value="USA">🇺🇸 USA</option>
              <option value="International">🌐 International</option>
            </select>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px', overflowX: 'auto' }}>
        {[
          { key: 'fixtures', label: '📅 Upcoming Match Predictions' },
          { key: 'matrix', label: '📊 Multi-Sport Matrix' },
          { key: 'lineups', label: '👥 Lineups & Starters' },
          { key: 'feeds', label: '📡 Live Ingestion Feeds' },
          { key: 'ratings', label: '📈 Bayesian Ratings & Form' },
          { key: 'calibration', label: '🎯 Calibration & Reliability' },
          { key: 'digest', label: '📑 Daily Brief & Export' },
          { key: 'accuracy', label: '📐 Mathematical Methodology' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: tab === t.key ? '700' : '500',
              background: tab === t.key ? '#0f172a' : '#ffffff',
              color: tab === t.key ? '#ffffff' : '#64748b',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: tab === t.key ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: '12px' }}>
          Calculating statistical probabilities from lineups, surface, and team metrics...
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '24px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {/* TAB 1: UPCOMING FIXTURES & MULTI-MARKET PREDICTIONS */}
      {tab === 'fixtures' && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Matches List Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#334155' }}>
              Scheduled Fixtures ({matches.length})
            </h3>
            {matches.map((m) => {
              const isSelected = m.fixtureId === selectedFixtureId;
              const pred = predictions[m.fixtureId];
              return (
                <div
                  key={m.fixtureId}
                  onClick={() => setSelectedFixtureId(m.fixtureId)}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: isSelected ? '#ffffff' : '#f8fafc',
                    border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(2, 132, 199, 0.12)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    <span>{getSportEmoji(m.sport)} {m.league}</span>
                    <span>{getCountryFlag(m.country)} {m.country}</span>
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>
                    {m.homeTeam} vs {m.awayTeam}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0' }}>
                    📅 {formatDate(m.kickoffDate)}
                  </div>
                  {pred && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '12px' }}>
                      <span style={{ color: '#0284c7', fontWeight: '600' }}>
                        Pick: {pred.predictedWinner}
                      </span>
                      <span style={{ fontSize: '11px', background: pred.confidenceRating === 'Very High' ? '#dcfce7' : '#f1f5f9', color: pred.confidenceRating === 'Very High' ? '#166534' : '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        {pred.confidenceRating}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detailed Match Prediction Panel */}
          {selectedMatch && selectedPred && (
            <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
              {/* Fixture Banner */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                      {getSportEmoji(selectedMatch.sport)} {selectedMatch.league.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>
                      {getCountryFlag(selectedMatch.country)} {selectedMatch.venue}
                    </span>
                  </div>
                  <h2 style={{ margin: 0, fontSize: '24px', color: '#0f172a' }}>
                    {selectedMatch.homeTeam} <span style={{ color: '#94a3b8' }}>vs</span> {selectedMatch.awayTeam}
                  </h2>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                    Kickoff: <strong>{formatDate(selectedMatch.kickoffDate)}</strong> &bull; Status: <span style={{ textTransform: 'capitalize', fontWeight: 'bold', color: selectedMatch.status === 'live' ? '#dc2626' : '#059669' }}>{selectedMatch.status}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Projected Winner</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0284c7' }}>{selectedPred.predictedWinner}</div>
                  <span style={{ fontSize: '11px', background: selectedPred.confidenceRating === 'Very High' ? '#dcfce7' : '#e0f2fe', color: selectedPred.confidenceRating === 'Very High' ? '#166534' : '#0369a1', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                    {selectedPred.confidenceRating} Confidence
                  </span>
                </div>
              </div>

              {/* Recommended Top Calls */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '15px', margin: '0 0 12px 0', color: '#334155' }}>
                  🎯 Recommended Model Predictions
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  {selectedPred.recommendedMarkets?.map((rec, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                        <span>{rec.market}</span>
                        <span style={{ fontWeight: 'bold', color: rec.confidence === 'Very High' ? '#166534' : '#0284c7' }}>{rec.confidence}</span>
                      </div>
                      <div style={{ fontWeight: '700', fontSize: '15px', color: '#0f172a' }}>{rec.prediction}</div>
                      <div style={{ fontSize: '13px', color: '#0284c7', fontWeight: 'bold', margin: '4px 0' }}>Probability: {rec.probability}%</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{rec.reasoning}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sport Specific Prediction Content */}
              {selectedMatch.sport === 'soccer' && selectedPred.outcomeProbabilities && (
                <>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '15px', margin: '0 0 12px 0', color: '#334155' }}>
                      ⚽ Match Winner (1X2) & Double Chance Probabilities
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedMatch.homeTeam} Win</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{selectedPred.outcomeProbabilities.homeWin}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Draw</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{selectedPred.outcomeProbabilities.draw}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedMatch.awayTeam} Win</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{selectedPred.outcomeProbabilities.awayWin}%</div>
                      </div>
                    </div>
                    {selectedPred.doubleChance && (
                      <div style={{ display: 'flex', gap: '16px', fontSize: '13px', background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
                        <span>Double Chance 1X: <strong>{selectedPred.doubleChance.homeOrDraw}%</strong></span>
                        <span>Double Chance 12: <strong>{selectedPred.doubleChance.homeOrAway}%</strong></span>
                        <span>Double Chance X2: <strong>{selectedPred.doubleChance.drawOrAway}%</strong></span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '15px', margin: '0 0 12px 0', color: '#334155' }}>
                      📊 Goals, Totals & Both Teams to Score (BTTS)
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Over 1.5</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedPred.totals?.over15}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Over 2.5</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedPred.totals?.over25}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>BTTS (Yes)</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedPred.btts?.yes}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Home Clean Sheet</div>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{selectedPred.cleanSheets?.homeCleanSheet}%</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Basketball Specifics */}
              {selectedMatch.sport === 'basketball' && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '15px', margin: '0 0 12px 0', color: '#334155' }}>
                    🏀 Point Spread, Totals & Projected Scores
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Projected Spread</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{selectedPred.spreadPrediction?.projectedSpread} pts</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Projected Total Points</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{selectedPred.expectedPoints?.total} pts</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Moneyline Win Prob</div>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0284c7' }}>{selectedPred.moneylineProbabilities?.homeWin}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Key Tactical Insights */}
              {selectedPred.keyInsights && (
                <div>
                  <h3 style={{ fontSize: '15px', margin: '0 0 10px 0', color: '#334155' }}>
                    💡 Key Lineup & Statistical Context
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '13px', lineHeight: '1.7' }}>
                    {selectedPred.keyInsights.map((insight, idx) => (
                      <li key={idx} dangerouslySetInnerHTML={{ __html: insight }} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MULTI-SPORT MATRIX */}
      {tab === 'matrix' && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#0f172a' }}>Multi-Sport Predictions Matrix</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>Comprehensive overview of all fixtures with model projections and confidence ratings.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px' }}>Sport / League</th>
                  <th style={{ padding: '10px' }}>Country</th>
                  <th style={{ padding: '10px' }}>Matchup & Date</th>
                  <th style={{ padding: '10px' }}>Projected Winner</th>
                  <th style={{ padding: '10px' }}>Confidence</th>
                  <th style={{ padding: '10px' }}>Top Recommended Call</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const p = predictions[m.fixtureId];
                  if (!p) return null;
                  return (
                    <tr key={m.fixtureId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{getSportEmoji(m.sport)} {m.league}</td>
                      <td style={{ padding: '10px' }}>{getCountryFlag(m.country)} {m.country}</td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: '700' }}>{m.homeTeam} vs {m.awayTeam}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{formatDate(m.kickoffDate)}</div>
                      </td>
                      <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>{p.predictedWinner}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', background: p.confidenceRating === 'Very High' ? '#dcfce7' : '#e0f2fe', color: p.confidenceRating === 'Very High' ? '#166534' : '#0369a1' }}>
                          {p.confidenceRating}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontWeight: '600' }}>
                          {p.recommendedMarkets?.[0]?.prediction || 'Consistent projection'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LINEUPS & STATISTICS */}
      {tab === 'lineups' && selectedMatch && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#0f172a' }}>
            Starting Lineups & Historical Statistics ({selectedMatch.sport.toUpperCase()})
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>
            {selectedMatch.homeTeam} vs {selectedMatch.awayTeam} &bull; {getCountryFlag(selectedMatch.country)} {selectedMatch.league}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{selectedMatch.homeTeam}</h3>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>Status: <strong>{selectedMatch.lineupInfo?.home.status || 'Confirmed'}</strong></div>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>Formation / Style: <strong>{selectedMatch.lineupInfo?.home.formation}</strong></div>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>Key Starters: <strong>{selectedMatch.lineupInfo?.home.keyPlayers.join(', ')}</strong></div>
              <div style={{ fontSize: '13px', color: '#b91c1c' }}>Injuries / Absentees: <strong>{selectedMatch.lineupInfo?.home.absentees.join(', ') || 'None'}</strong></div>
            </div>
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{selectedMatch.awayTeam}</h3>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>Status: <strong>{selectedMatch.lineupInfo?.away.status || 'Confirmed'}</strong></div>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>Formation / Style: <strong>{selectedMatch.lineupInfo?.away.formation}</strong></div>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}>Key Starters: <strong>{selectedMatch.lineupInfo?.away.keyPlayers.join(', ')}</strong></div>
              <div style={{ fontSize: '13px', color: '#b91c1c' }}>Injuries / Absentees: <strong>{selectedMatch.lineupInfo?.away.absentees.join(', ') || 'None'}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: OPTION 1 - LIVE INGESTION FEEDS */}
      {tab === 'feeds' && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#0f172a' }}>📡 Live External Feeds & Ingestion Control</h2>
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Automated synchronization pipeline connecting Football-Data.org, API-Football, TheSportsDB, and Simulated In-Play streams.</p>
            </div>
            <button
              onClick={() => triggerLiveSync()}
              disabled={syncing}
              style={{ padding: '10px 18px', background: syncing ? '#94a3b8' : '#059669', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: syncing ? 'not-allowed' : 'pointer' }}
            >
              {syncing ? '⏳ Synchronizing...' : '⚡ Sync Live Data Now'}
            </button>
          </div>

          {syncMessage && (
            <div style={{ padding: '12px', background: '#ecfdf5', color: '#065f46', borderRadius: '8px', marginBottom: '20px', border: '1px solid #a7f3d0', fontSize: '13px' }}>
              {syncMessage}
            </div>
          )}

          {feedStatus && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Active Feed Provider</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0284c7', textTransform: 'capitalize' }}>{feedStatus.activeProvider}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Managed Fixtures in Pipeline</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{feedStatus.totalManagedFixtures} Matches</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Last Synchronized</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>{feedStatus.lastSyncTimestamp ? formatDate(feedStatus.lastSyncTimestamp) : 'Just now'}</div>
              </div>
            </div>
          )}

          <h3 style={{ fontSize: '16px', margin: '24px 0 12px 0', color: '#334155' }}>Available Feed Providers</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {feedStatus?.availableProviders.map((p) => (
              <div key={p.id} style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{p.name}</span>
                  <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: p.hasKeyConfigured ? '#dcfce7' : '#fee2e2', color: p.hasKeyConfigured ? '#166534' : '#991b1b', fontWeight: 'bold' }}>
                    {p.hasKeyConfigured ? 'Ready / Configured' : 'Key Required'}
                  </span>
                </div>
                <button
                  onClick={() => triggerLiveSync(p.id)}
                  disabled={syncing}
                  style={{ marginTop: '10px', padding: '6px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Sync from {p.id}
                </button>
              </div>
            ))}
          </div>

          <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>🔑 Configure Custom API Credentials (Optional)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Football-Data.org Token (X-Auth-Token)</label>
                <input
                  type="password"
                  placeholder="Paste Football-Data.org API token..."
                  value={footballDataKey}
                  onChange={(e) => setFootballDataKey(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>API-Football / RapidAPI Key</label>
                <input
                  type="password"
                  placeholder="Paste API-Football key..."
                  value={apiFootballKey}
                  onChange={(e) => setApiFootballKey(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '12px' }}
                />
              </div>
            </div>
            <button
              onClick={saveFeedKeys}
              style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Save Credentials
            </button>
          </div>
        </div>
      )}

      {/* TAB 5: OPTION 3 - DYNAMIC BAYESIAN RATINGS */}
      {tab === 'ratings' && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#0f172a' }}>📈 Dynamic Bayesian Ratings & Form Learning</h2>
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Dixon-Coles attacking and defensive ratings with Bayesian MAP stochastic gradient parameter updating.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['all', 'soccer', 'basketball', 'hockey'].map((sp) => (
                <button
                  key={sp}
                  onClick={() => { setRatingsSportFilter(sp); }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: ratingsSportFilter === sp ? '2px solid #0284c7' : '1px solid #cbd5e0',
                    background: ratingsSportFilter === sp ? '#e0f2fe' : '#fff',
                    color: ratingsSportFilter === sp ? '#0369a1' : '#475569',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px' }}>Team</th>
                  <th style={{ padding: '10px' }}>Sport</th>
                  <th style={{ padding: '10px' }}>Attack Strength (Home / Away)</th>
                  <th style={{ padding: '10px' }}>Defence Vulnerability (Home / Away)</th>
                  <th style={{ padding: '10px' }}>Home Advantage</th>
                  <th style={{ padding: '10px' }}>Matches Analyzed</th>
                  <th style={{ padding: '10px' }}>Form Trend</th>
                  <th style={{ padding: '10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {ratingsList
                  .filter((r) => ratingsSportFilter === 'all' || r.sport === ratingsSportFilter)
                  .map((r) => (
                    <tr key={r.normalizedName} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>{r.team}</td>
                      <td style={{ padding: '10px' }}>{getSportEmoji(r.sport)} {r.sport.toUpperCase()}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ color: '#059669', fontWeight: 'bold' }}>{r.homeAttack.toFixed(2)}</span> / <span style={{ color: '#059669' }}>{r.awayAttack.toFixed(2)}</span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{r.homeDefence.toFixed(2)}</span> / <span style={{ color: '#dc2626' }}>{r.awayDefence.toFixed(2)}</span>
                      </td>
                      <td style={{ padding: '10px' }}>+{((r.homeAdvantage - 1) * 100).toFixed(0)}%</td>
                      <td style={{ padding: '10px' }}>{r.matchesAnalyzed}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          background: r.formTrend === 'improving' ? '#dcfce7' : r.formTrend === 'declining' ? '#fee2e2' : '#f1f5f9',
                          color: r.formTrend === 'improving' ? '#166534' : r.formTrend === 'declining' ? '#991b1b' : '#475569',
                        }}>
                          {r.formTrend === 'improving' ? '📈 Improving' : r.formTrend === 'declining' ? '📉 Declining' : '➡️ Stable'}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button
                          onClick={() => setSelectedTeamHistory(r)}
                          style={{ padding: '4px 8px', background: '#f1f5f9', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Team History Modal / Drawer */}
          {selectedTeamHistory && (
            <div style={{ marginTop: '24px', padding: '18px', background: '#f8fafc', borderRadius: '8px', border: '2px solid #0284c7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                  📊 Bayesian Progression History: <strong>{selectedTeamHistory.team}</strong>
                </h3>
                <button
                  onClick={() => setSelectedTeamHistory(null)}
                  style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#e2e8f0' }}>
                      <th style={{ padding: '8px' }}>Date</th>
                      <th style={{ padding: '8px' }}>Opponent</th>
                      <th style={{ padding: '8px' }}>Venue</th>
                      <th style={{ padding: '8px' }}>Result</th>
                      <th style={{ padding: '8px' }}>Attack Rating</th>
                      <th style={{ padding: '8px' }}>Attack Shift</th>
                      <th style={{ padding: '8px' }}>Defence Rating</th>
                      <th style={{ padding: '8px' }}>Defence Shift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeamHistory.history.map((h, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #cbd5e0' }}>
                        <td style={{ padding: '8px' }}>{formatDate(h.date)}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{h.opponent}</td>
                        <td style={{ padding: '8px', textTransform: 'capitalize' }}>{h.venue}</td>
                        <td style={{ padding: '8px' }}>{h.score}</td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{h.attackRating.toFixed(3)}</td>
                        <td style={{ padding: '8px', color: h.deltaAttack >= 0 ? '#166534' : '#991b1b' }}>
                          {h.deltaAttack >= 0 ? `+${h.deltaAttack.toFixed(4)}` : h.deltaAttack.toFixed(4)}
                        </td>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{h.defenceRating.toFixed(3)}</td>
                        <td style={{ padding: '8px', color: h.deltaDefence <= 0 ? '#166534' : '#991b1b' }}>
                          {h.deltaDefence >= 0 ? `+${h.deltaDefence.toFixed(4)}` : h.deltaDefence.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: OPTION 4 - MODEL CALIBRATION & RELIABILITY */}
      {tab === 'calibration' && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#0f172a' }}>🎯 Statistical Model Calibration & Reliability Diagram</h2>
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Evaluating whether the model's confidence corresponds directly to empirical real-world frequency.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['all', 'soccer', 'basketball', 'hockey', 'tennis'].map((sp) => (
                <button
                  key={sp}
                  onClick={() => { setCalibrationSportFilter(sp); fetchCalibration(); }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: calibrationSportFilter === sp ? '2px solid #0284c7' : '1px solid #cbd5e0',
                    background: calibrationSportFilter === sp ? '#e0f2fe' : '#fff',
                    color: calibrationSportFilter === sp ? '#0369a1' : '#475569',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {sp}
                </button>
              ))}
            </div>
          </div>

          {calibrationData && (
            <>
              {/* Scorecard Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Expected Calibration Error (ECE)</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0284c7' }}>{calibrationData.expectedCalibrationError}%</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Target: &lt; 5.0%</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Brier Calibration Score</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{calibrationData.brierScore}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>0.0 = Perfect, 0.25 = Random</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Log-Loss (Cross Entropy)</div>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{calibrationData.logLoss}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Penalizes overconfidence</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Calibration Rating</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#166534' }}>{calibrationData.calibrationQuality}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{calibrationData.totalPredictions} Analyzed Predictions</div>
                </div>
              </div>

              {/* Reliability Diagram Decile Table */}
              <h3 style={{ fontSize: '16px', margin: '0 0 12px 0', color: '#334155' }}>
                📊 Reliability Curve: Decile Probability vs Realized Frequency
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '10px' }}>Probability Bin</th>
                      <th style={{ padding: '10px' }}>Predictions Count</th>
                      <th style={{ padding: '10px' }}>Model Predicted Mean</th>
                      <th style={{ padding: '10px' }}>Empirical Win Rate</th>
                      <th style={{ padding: '10px' }}>Calibration Gap</th>
                      <th style={{ padding: '10px' }}>Visual Curve Alignment</th>
                      <th style={{ padding: '10px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibrationData.bins.map((b) => (
                      <tr key={b.binIndex} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: 'bold' }}>{b.range}</td>
                        <td style={{ padding: '10px' }}>{b.sampleCount} matches</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0284c7' }}>{b.predictedAvg}%</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>{b.empiricalWinRate}%</td>
                        <td style={{ padding: '10px', color: b.calibrationGap > 6 ? '#b91c1c' : '#166534' }}>
                          {b.calibrationGap.toFixed(1)}%
                        </td>
                        <td style={{ padding: '10px', minWidth: '160px' }}>
                          <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '14px', width: '100%', position: 'relative' }}>
                            <div
                              style={{
                                background: '#94a3b8',
                                height: '100%',
                                width: `${b.predictedAvg}%`,
                                borderRadius: '4px',
                                opacity: 0.6,
                                position: 'absolute',
                              }}
                              title={`Model: ${b.predictedAvg}%`}
                            />
                            <div
                              style={{
                                background: '#0284c7',
                                height: '100%',
                                width: `${b.empiricalWinRate}%`,
                                borderRadius: '4px',
                                opacity: 0.85,
                                position: 'absolute',
                              }}
                              title={`Actual: ${b.empiricalWinRate}%`}
                            />
                          </div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: b.status === 'well-calibrated' ? '#dcfce7' : b.status === 'sparse' ? '#f1f5f9' : '#fee2e2',
                            color: b.status === 'well-calibrated' ? '#166534' : b.status === 'sparse' ? '#64748b' : '#991b1b',
                            textTransform: 'capitalize',
                          }}>
                            {b.status.replace('-', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 7: OPTION 5 - DAILY BRIEF & EXPORT */}
      {tab === 'digest' && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#0f172a' }}>📑 Automated Daily Sports Intelligence Digest & Export</h2>
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Morning preview ranking highest-confidence predictions, statistical anomalies, and one-click data downloads.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <a
                href={`${getApiBase()}/export/csv`}
                download="arbiter-sports-predictions.csv"
                style={{ padding: '10px 14px', background: '#0284c7', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                📥 Download CSV
              </a>
              <a
                href={`${getApiBase()}/export/json`}
                download="arbiter-sports-predictions.json"
                style={{ padding: '10px 14px', background: '#0f172a', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                📥 Download JSON
              </a>
              <button
                onClick={copyBriefToClipboard}
                style={{ padding: '10px 14px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e0', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {copiedBrief ? '✓ Copied!' : '📋 Copy Brief'}
              </button>
            </div>
          </div>

          {digestData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              {/* Banker Picks Card */}
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🎯 Top High-Confidence Statistical Bankers
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {digestData.topBankerPicks.map((b, i) => (
                    <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{b.match}</div>
                      <div style={{ fontSize: '12px', color: '#0284c7', fontWeight: '600' }}>
                        {b.market}: <strong>{b.prediction}</strong> ({b.probability}%)
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{b.reasoning}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Value Anomalies Card */}
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📊 Statistical Edge & Value Anomalies
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {digestData.topValueAnomalies.length > 0 ? (
                    digestData.topValueAnomalies.map((v, i) => (
                      <div key={i} style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{v.match}</div>
                        <div style={{ fontSize: '12px', color: '#0f172a' }}>
                          Selection: <strong>{v.prediction}</strong> &bull; Model Prob: <strong>{v.modelProb}%</strong>
                        </div>
                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold' }}>
                          Statistical Edge: +{v.edgePercent}% (Market Implied: {v.impliedProb}%)
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: '#64748b' }}>No statistical anomalies currently above edge threshold.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Webhook Dispatch Section */}
          <div style={{ background: '#f1f5f9', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>📡 Scheduled Notification Webhook (Discord / Slack)</h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>Dispatch today's automated intelligence brief directly to your private Discord, Telegram, or Slack channel.</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="https://discord.com/api/webhooks/... or Slack webhook URL"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                style={{ flex: 1, minWidth: '280px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px' }}
              />
              <button
                onClick={sendWebhookTest}
                style={{ padding: '8px 18px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Send Test Dispatch
              </button>
            </div>
            {webhookStatus && (
              <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 'bold', color: webhookStatus.includes('✅') ? '#166534' : '#991b1b' }}>
                {webhookStatus}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: MATHEMATICAL METHODOLOGY */}
      {tab === 'accuracy' && (
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '20px', margin: '0 0 10px 0', color: '#0f172a' }}>
            Cross-Sport Modeling & Statistical Foundations
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>⚽ Football / Soccer</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Bivariate Poisson distribution adjusted via Dixon-Coles parameters for 0-0 and 1-1 low-scoring correlations, incorporating home advantage and dynamic Bayesian ratings.
              </p>
            </div>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>🏀 Basketball (NBA)</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Possession-pace model with adjusted offensive and defensive ratings per 100 possessions. Win probabilities and point spreads evaluated using Gaussian margin distributions.
              </p>
            </div>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>🏒 Ice Hockey (NHL)</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Poisson regulation scoring model combined with starting goalie save percentages and overtime tie-breaker progression for 60-min and Moneyline projections.
              </p>
            </div>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#0f172a' }}>🎾 Tennis (ATP/WTA)</h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Barnett-Clarke hierarchical Markov chain model calculating game, set, and match win distributions from court-specific service-hold percentages.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
