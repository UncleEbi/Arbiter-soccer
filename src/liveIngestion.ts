// Live External Feeds & Ingestion Pipeline
// Supports Football-Data.org, API-Football / RapidAPI, TheSportsDB, and Simulated Live In-Play Stream.

import axios from 'axios';
import { MatchData } from './index';
import { SportType } from './model';

export interface FeedConfig {
  activeProvider: 'simulation' | 'football-data' | 'api-football' | 'thesportsdb';
  footballDataApiKey?: string;
  apiFootballApiKey?: string;
  autoSyncIntervalSec: number; // e.g. 60s
  autoSyncEnabled: boolean;
}

export interface FeedStatus {
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

export class LiveFeedManager {
  private config: FeedConfig;
  private matchesRef: Map<string, MatchData>;
  private lastSyncTimestamp: string | null = null;
  private lastSyncResult: FeedStatus['lastSyncResult'] = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(matchesRef: Map<string, MatchData>) {
    this.matchesRef = matchesRef;
    this.config = {
      activeProvider: (process.env.DEFAULT_FEED_PROVIDER as any) || 'simulation',
      footballDataApiKey: process.env.FOOTBALL_DATA_KEY || '',
      apiFootballApiKey: process.env.API_FOOTBALL_KEY || '',
      autoSyncIntervalSec: 60,
      autoSyncEnabled: false,
    };
  }

  public getConfig(): FeedConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<FeedConfig>): FeedConfig {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.autoSyncEnabled !== undefined || newConfig.autoSyncIntervalSec !== undefined) {
      if (this.config.autoSyncEnabled) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
      }
    }
    return this.getConfig();
  }

  public getStatus(): FeedStatus {
    return {
      activeProvider: this.config.activeProvider,
      autoSyncEnabled: this.config.autoSyncEnabled,
      autoSyncIntervalSec: this.config.autoSyncIntervalSec,
      lastSyncTimestamp: this.lastSyncTimestamp,
      lastSyncResult: this.lastSyncResult,
      totalManagedFixtures: this.matchesRef.size,
      availableProviders: [
        {
          id: 'simulation',
          name: 'Simulated High-Fidelity Sports Feed & In-Play Generator',
          requiresKey: false,
          hasKeyConfigured: true,
        },
        {
          id: 'football-data',
          name: 'Football-Data.org API (Premier League, La Liga, Serie A, UCL)',
          requiresKey: true,
          hasKeyConfigured: Boolean(this.config.footballDataApiKey && this.config.footballDataApiKey.length > 5),
        },
        {
          id: 'api-football',
          name: 'API-Football / RapidAPI (Multi-Sport & Live Scores)',
          requiresKey: true,
          hasKeyConfigured: Boolean(this.config.apiFootballApiKey && this.config.apiFootballApiKey.length > 5),
        },
        {
          id: 'thesportsdb',
          name: 'TheSportsDB Free Open Sports API',
          requiresKey: false,
          hasKeyConfigured: true,
        },
      ],
    };
  }

  public async sync(providerOverride?: string): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const provider = providerOverride || this.config.activeProvider;
    let result = { source: provider, fixturesAdded: 0, fixturesUpdated: 0, message: '' };

    try {
      if (provider === 'football-data') {
        result = await this.syncFootballData();
      } else if (provider === 'api-football') {
        result = await this.syncApiFootball();
      } else if (provider === 'thesportsdb') {
        result = await this.syncTheSportsDB();
      } else {
        result = this.syncSimulation();
      }
    } catch (err: any) {
      result = {
        source: provider,
        fixturesAdded: 0,
        fixturesUpdated: 0,
        message: `Sync failed: ${err.message}. Falling back to high-fidelity simulated pipeline.`,
      };
      // Automatic fallback
      const sim = this.syncSimulation();
      result.fixturesAdded = sim.fixturesAdded;
      result.fixturesUpdated = sim.fixturesUpdated;
    }

    this.lastSyncTimestamp = new Date().toISOString();
    this.lastSyncResult = result;
    return result;
  }

  // Provider 1: Football-Data.org
  private async syncFootballData(): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const key = this.config.footballDataApiKey;
    if (!key) {
      throw new Error('Football-Data.org API key not configured. Please supply FOOTBALL_DATA_KEY.');
    }

    const resp = await axios.get('https://api.football-data.org/v4/matches', {
      headers: { 'X-Auth-Token': key },
      timeout: 8000,
    });

    const matchesList = resp.data.matches || [];
    let added = 0;
    let updated = 0;

    for (const m of matchesList) {
      const fixId = m.id;
      const keyStr = String(fixId);
      const isExisting = this.matchesRef.has(keyStr);

      const homeName = m.homeTeam?.name || 'Home Team';
      const awayName = m.awayTeam?.name || 'Away Team';
      const status = m.status === 'IN_PLAY' || m.status === 'PAUSED' ? 'live' : m.status === 'FINISHED' ? 'finished' : 'scheduled';

      const matchData: MatchData = {
        fixtureId: fixId,
        sport: 'soccer',
        country: m.area?.name || 'International',
        homeTeam: homeName,
        awayTeam: awayName,
        kickoffDate: m.utcDate || new Date().toISOString(),
        league: m.competition?.name || 'Top Division',
        venue: 'Stadium',
        round: `Matchday ${m.matchday || 1}`,
        status,
        homeGoals: m.score?.fullTime?.home ?? (m.score?.halfTime?.home ?? 0),
        awayGoals: m.score?.fullTime?.away ?? (m.score?.halfTime?.away ?? 0),
        stats: {
          homeForm: ['W', 'D', 'W', 'W', 'D'],
          awayForm: ['W', 'L', 'W', 'D', 'W'],
          homeAvgScored: 1.8,
          homeAvgConceded: 1.0,
          awayAvgScored: 1.5,
          awayAvgConceded: 1.2,
          homeCleanSheetPct: 35,
          awayCleanSheetPct: 30,
          h2hSummary: 'Recent H2H: Competitive division matchup',
        },
      };

      this.matchesRef.set(keyStr, matchData);
      if (isExisting) updated++;
      else added++;
    }

    return {
      source: 'Football-Data.org',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Successfully synchronized ${matchesList.length} matches from Football-Data.org`,
    };
  }

  // Provider 2: API-Football
  private async syncApiFootball(): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const key = this.config.apiFootballApiKey;
    if (!key) {
      throw new Error('API-Football key not configured. Please supply API_FOOTBALL_KEY.');
    }

    const resp = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 'x-apisports-key': key },
      timeout: 8000,
    });

    const liveFixtures = resp.data.response || [];
    let added = 0;
    let updated = 0;

    for (const item of liveFixtures) {
      const fixId = item.fixture.id;
      const keyStr = String(fixId);
      const isExisting = this.matchesRef.has(keyStr);

      const matchData: MatchData = {
        fixtureId: fixId,
        sport: 'soccer',
        country: item.league.country || 'Europe',
        homeTeam: item.teams.home.name,
        awayTeam: item.teams.away.name,
        kickoffDate: item.fixture.date,
        league: item.league.name,
        venue: item.fixture.venue?.name || 'Stadium',
        status: 'live',
        homeGoals: item.goals.home ?? 0,
        awayGoals: item.goals.away ?? 0,
        liveStats: {
          elapsedMinutes: item.fixture.status.elapsed || 45,
          homeGoals: item.goals.home ?? 0,
          awayGoals: item.goals.away ?? 0,
          possession: 50,
          shots: 8,
          shotsOnTarget: 4,
        },
      };

      this.matchesRef.set(keyStr, matchData);
      if (isExisting) updated++;
      else added++;
    }

    return {
      source: 'API-Football',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Synchronized ${liveFixtures.length} live matches from API-Football`,
    };
  }

  // Provider 3: TheSportsDB Free Open Endpoint
  private async syncTheSportsDB(): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const today = new Date().toISOString().split('T')[0];
    const resp = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${today}&s=Soccer`, {
      timeout: 8000,
    });

    const events = resp.data.events || [];
    let added = 0;
    let updated = 0;

    for (const ev of events.slice(0, 15)) {
      const fixId = parseInt(ev.idEvent, 10) || Math.floor(Math.random() * 100000);
      const keyStr = String(fixId);
      const isExisting = this.matchesRef.has(keyStr);

      const matchData: MatchData = {
        fixtureId: fixId,
        sport: 'soccer',
        country: ev.strCountry || 'International',
        homeTeam: ev.strHomeTeam,
        awayTeam: ev.strAwayTeam,
        kickoffDate: `${ev.dateEvent}T${ev.strTime || '15:00:00Z'}`,
        league: ev.strLeague,
        venue: ev.strVenue || 'Stadium',
        status: ev.strStatus === 'Match Finished' ? 'finished' : 'scheduled',
        homeGoals: ev.intHomeScore ? parseInt(ev.intHomeScore, 10) : undefined,
        awayGoals: ev.intAwayScore ? parseInt(ev.intAwayScore, 10) : undefined,
      };

      this.matchesRef.set(keyStr, matchData);
      if (isExisting) updated++;
      else added++;
    }

    return {
      source: 'TheSportsDB',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Synchronized ${events.length} events from TheSportsDB`,
    };
  }

  // Provider 4: High-Fidelity Multi-Sport Simulation & Live Score Progression
  public syncSimulation(): { source: string; fixturesAdded: number; fixturesUpdated: number; message: string } {
    let updated = 0;
    let added = 0;

    // 1. Advance in-play simulation for matches
    for (const match of this.matchesRef.values()) {
      if (match.status === 'live' && match.liveStats) {
        const curMin = match.liveStats.elapsedMinutes || 10;
        if (curMin < 90) {
          match.liveStats.elapsedMinutes = Math.min(90, curMin + 5);
          match.liveStats.shots = (match.liveStats.shots || 0) + (Math.random() > 0.4 ? 1 : 0);
          match.liveStats.shotsOnTarget = (match.liveStats.shotsOnTarget || 0) + (Math.random() > 0.7 ? 1 : 0);
          // Occasional goal
          if (Math.random() < 0.12) {
            if (Math.random() > 0.45) {
              match.homeGoals = (match.homeGoals || 0) + 1;
              match.liveStats.homeGoals = match.homeGoals;
            } else {
              match.awayGoals = (match.awayGoals || 0) + 1;
              match.liveStats.awayGoals = match.awayGoals;
            }
          }
          updated++;
        }
      }
    }

    // 2. Add dynamic upcoming fixtures if few exist
    if (this.matchesRef.size < 12) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const newFixtures: MatchData[] = [
        {
          fixtureId: 101,
          sport: 'soccer',
          country: 'England',
          homeTeam: 'Tottenham',
          awayTeam: 'Aston Villa',
          kickoffDate: tomorrow,
          league: 'Premier League',
          venue: 'Tottenham Hotspur Stadium, London',
          round: 'Matchday 13',
          status: 'scheduled',
          lineupInfo: {
            home: {
              formation: '4-3-3',
              status: 'Predicted',
              keyPlayers: ['Son Heung-min', 'James Maddison'],
              absentees: ['Richarlison (Calf)'],
              tacticalStyle: 'High defensive line and inverted fullbacks',
            },
            away: {
              formation: '4-4-2',
              status: 'Confirmed',
              keyPlayers: ['Ollie Watkins', 'Emiliano Martínez'],
              absentees: ['None'],
              tacticalStyle: 'Compact mid-block and disciplined offside trap',
            },
          },
          stats: {
            homeForm: ['W', 'L', 'W', 'W', 'L'],
            awayForm: ['W', 'W', 'D', 'W', 'L'],
            homeAvgScored: 2.1,
            homeAvgConceded: 1.4,
            awayAvgScored: 1.9,
            awayAvgConceded: 1.2,
            homeCleanSheetPct: 25,
            awayCleanSheetPct: 30,
            h2hSummary: 'Last 4 meetings: 3.5 average goals per game',
          },
          odds: {
            home: 2.15,
            draw: 3.60,
            away: 3.10,
            over25: 1.62,
            under25: 2.25,
            bttsYes: 1.55,
            bttsNo: 2.40,
            bookmaker: 'Pinnacle / Market Closing',
            lastUpdated: new Date().toISOString(),
          },
        },
        {
          fixtureId: 102,
          sport: 'basketball',
          country: 'USA',
          homeTeam: 'Denver Nuggets',
          awayTeam: 'Golden State Warriors',
          kickoffDate: tomorrow,
          league: 'NBA',
          venue: 'Ball Arena, Denver',
          round: 'Regular Season',
          status: 'scheduled',
          lineupInfo: {
            home: {
              formation: 'Starting 5',
              status: 'Confirmed',
              keyPlayers: ['Nikola Jokic', 'Jamal Murray'],
              absentees: ['Aaron Gordon (Probable)'],
              tacticalStyle: 'Elbow playmaking hub, high altitude pace, and offensive glass crash',
            },
            away: {
              formation: 'Starting 5',
              status: 'Confirmed',
              keyPlayers: ['Stephen Curry', 'Draymond Green'],
              absentees: ['None'],
              tacticalStyle: 'Relentless off-ball perimeter motion and splash shooting',
            },
          },
          sportSpecificStats: {
            homePace: 98.2,
            awayPace: 101.5,
            homeORtg: 121.2,
            homeDRtg: 111.4,
            awayORtg: 116.8,
            awayDRtg: 112.5,
          },
          stats: {
            homeForm: ['W', 'W', 'W', 'L', 'W'],
            awayForm: ['W', 'L', 'W', 'W', 'L'],
            homeAvgScored: 118.5,
            homeAvgConceded: 110.2,
            awayAvgScored: 116.1,
            awayAvgConceded: 112.8,
            homeCleanSheetPct: 0,
            awayCleanSheetPct: 0,
            h2hSummary: 'Nuggets have won 6 of the last 7 meetings at Ball Arena',
          },
        },
      ];

      for (const fix of newFixtures) {
        if (!this.matchesRef.has(String(fix.fixtureId))) {
          this.matchesRef.set(String(fix.fixtureId), fix);
          added++;
        }
      }
    }

    return {
      source: 'High-Fidelity Simulated Pipeline',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Synchronized ${added} new fixtures and advanced ${updated} live in-play matches`,
    };
  }

  public startAutoSync(intervalSeconds: number = this.config.autoSyncIntervalSec): void {
    this.stopAutoSync();
    this.config.autoSyncEnabled = true;
    this.config.autoSyncIntervalSec = intervalSeconds;
    this.timer = setInterval(() => {
      this.sync().catch((err) => console.error('AutoSync error:', err));
    }, intervalSeconds * 1000);
  }

  public stopAutoSync(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.config.autoSyncEnabled = false;
  }
}
