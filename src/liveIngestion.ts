// Live External Feeds & Ingestion Pipeline
// Supports Football-Data.org, API-Football / RapidAPI, TheSportsDB, and Simulated Live In-Play Stream.

import axios from 'axios';
import { MatchData } from './fixtures';
import { SportType } from './model';

export interface FeedConfig {
  activeProvider: 'simulation' | 'football-data' | 'api-football' | 'thesportsdb';
  footballDataApiKey?: string;
  apiFootballApiKey?: string;
  autoSyncIntervalSec: number;
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
      if (this.config.autoSyncEnabled) this.startAutoSync();
      else this.stopAutoSync();
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
        { id: 'simulation', name: 'Simulated High-Fidelity Sports Feed & In-Play Generator', requiresKey: false, hasKeyConfigured: true },
        { id: 'football-data', name: 'Football-Data.org API (Premier League, La Liga, Serie A, UCL)', requiresKey: true, hasKeyConfigured: Boolean((this.config.footballDataApiKey?.length ?? 0) > 5) },
        { id: 'api-football', name: 'API-Football / RapidAPI (Multi-Sport & Live Scores)', requiresKey: true, hasKeyConfigured: Boolean((this.config.apiFootballApiKey?.length ?? 0) > 5) },
        { id: 'thesportsdb', name: 'TheSportsDB Free Open Sports API', requiresKey: false, hasKeyConfigured: true },
      ],
    };
  }

  /**
   * Single unified fixture upsert helper: merges into the local shelf and tracks changes
   */
  public upsert(fixture: MatchData): boolean {
    const key = String(fixture.fixtureId);
    const isExisting = this.matchesRef.has(key);
    if (isExisting) {
      const prev = this.matchesRef.get(key)!;
      this.matchesRef.set(key, { ...prev, ...fixture });
    } else {
      this.matchesRef.set(key, fixture);
    }
    return isExisting;
  }

  /**
   * Unified batch merge helper
   */
  public mergeFixtures(fixtures: MatchData[]): { added: number; updated: number } {
    let added = 0;
    let updated = 0;
    for (const f of fixtures) {
      if (this.upsert(f)) updated++;
      else added++;
    }
    return { added, updated };
  }

  public async sync(providerOverride?: string): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const provider = providerOverride || this.config.activeProvider;
    let result = { source: provider, fixturesAdded: 0, fixturesUpdated: 0, message: '' };

    try {
      switch (provider) {
        case 'football-data':
          result = await this.syncFootballData();
          break;
        case 'api-football':
          result = await this.syncApiFootball();
          break;
        case 'thesportsdb':
          result = await this.syncTheSportsDB();
          break;
        default:
          result = this.syncSimulation();
      }
    } catch (err: any) {
      // Graceful fallback to simulation pipeline
      const sim = this.syncSimulation();
      result = {
        source: provider,
        fixturesAdded: sim.fixturesAdded,
        fixturesUpdated: sim.fixturesUpdated,
        message: `Sync fallback (${err.message}): ${sim.message}`,
      };
    }

    this.lastSyncTimestamp = new Date().toISOString();
    this.lastSyncResult = result;
    return result;
  }

  private async syncFootballData(): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const key = this.config.footballDataApiKey;
    if (!key) throw new Error('Football-Data.org API key not configured.');

    const resp = await axios.get('https://api.football-data.org/v4/matches', {
      headers: { 'X-Auth-Token': key },
      timeout: 8000,
    });

    const parsed: MatchData[] = (resp.data.matches || []).map((m: any) => ({
      fixtureId: m.id,
      sport: 'soccer' as SportType,
      country: m.area?.name || 'International',
      homeTeam: m.homeTeam?.name || 'Home Team',
      awayTeam: m.awayTeam?.name || 'Away Team',
      kickoffDate: m.utcDate || new Date().toISOString(),
      league: m.competition?.name || 'Top Division',
      venue: 'Stadium',
      round: `Matchday ${m.matchday || 1}`,
      status: m.status === 'IN_PLAY' || m.status === 'PAUSED' ? 'live' : m.status === 'FINISHED' ? 'finished' : 'scheduled',
      homeGoals: m.score?.fullTime?.home ?? (m.score?.halfTime?.home ?? 0),
      awayGoals: m.score?.fullTime?.away ?? (m.score?.halfTime?.away ?? 0),
    }));

    const { added, updated } = this.mergeFixtures(parsed);
    return {
      source: 'Football-Data.org',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Synchronized ${parsed.length} matches from Football-Data.org`,
    };
  }

  private async syncApiFootball(): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const key = this.config.apiFootballApiKey;
    if (!key) throw new Error('API-Football key not configured.');

    const resp = await axios.get('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 'x-apisports-key': key },
      timeout: 8000,
    });

    const parsed: MatchData[] = (resp.data.response || []).map((item: any) => ({
      fixtureId: item.fixture.id,
      sport: 'soccer' as SportType,
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
    }));

    const { added, updated } = this.mergeFixtures(parsed);
    return {
      source: 'API-Football',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Synchronized ${parsed.length} live matches from API-Football`,
    };
  }

  private async syncTheSportsDB(): Promise<{ source: string; fixturesAdded: number; fixturesUpdated: number; message: string }> {
    const today = new Date().toISOString().split('T')[0];
    const resp = await axios.get(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${today}&s=Soccer`, { timeout: 8000 });

    const parsed: MatchData[] = (resp.data.events || []).slice(0, 15).map((ev: any) => ({
      fixtureId: parseInt(ev.idEvent, 10) || Math.floor(Math.random() * 100000),
      sport: 'soccer' as SportType,
      country: ev.strCountry || 'International',
      homeTeam: ev.strHomeTeam,
      awayTeam: ev.strAwayTeam,
      kickoffDate: `${ev.dateEvent}T${ev.strTime || '15:00:00Z'}`,
      league: ev.strLeague,
      venue: ev.strVenue || 'Stadium',
      status: ev.strStatus === 'Match Finished' ? 'finished' : 'scheduled',
      homeGoals: ev.intHomeScore ? parseInt(ev.intHomeScore, 10) : undefined,
      awayGoals: ev.intAwayScore ? parseInt(ev.intAwayScore, 10) : undefined,
    }));

    const { added, updated } = this.mergeFixtures(parsed);
    return {
      source: 'TheSportsDB',
      fixturesAdded: added,
      fixturesUpdated: updated,
      message: `Synchronized ${parsed.length} events from TheSportsDB`,
    };
  }

  public syncSimulation(): { source: string; fixturesAdded: number; fixturesUpdated: number; message: string } {
    let updated = 0;

    // 1. Advance in-play simulation for active matches
    for (const match of this.matchesRef.values()) {
      if (match.status === 'live' && match.liveStats) {
        const curMin = match.liveStats.elapsedMinutes || 10;
        if (curMin < 90) {
          match.liveStats.elapsedMinutes = Math.min(90, curMin + 5);
          match.liveStats.shots = (match.liveStats.shots || 0) + 1;
          match.liveStats.shotsOnTarget = (match.liveStats.shotsOnTarget || 0) + (Math.random() > 0.5 ? 1 : 0);
          if (Math.random() < 0.15) {
            match.homeGoals = (match.homeGoals || 0) + 1;
            match.liveStats.homeGoals = match.homeGoals;
          }
          updated++;
        }
      }
    }

    // 2. Add realistic supplemental shelf fixtures if inventory is low
    let added = 0;
    if (this.matchesRef.size < 12) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const supplements: MatchData[] = [
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
          odds: { home: 2.15, draw: 3.60, away: 3.10, over25: 1.62, under25: 2.25, bookmaker: 'Pinnacle' },
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
          sportSpecificStats: { homePace: 98.2, awayPace: 101.5, homeORtg: 121.2, homeDRtg: 111.4, awayORtg: 116.8, awayDRtg: 112.5 },
        },
      ];
      const merged = this.mergeFixtures(supplements);
      added = merged.added;
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
