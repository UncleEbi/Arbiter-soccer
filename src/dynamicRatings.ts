// Dynamic Bayesian Rating Engine with Time-Decay & Stochastic Gradient Updating
// Based on Dixon & Coles (1997) dynamic extension and Bayesian MAP (Maximum A Posteriori) estimation.

import {
  SportType,
  TeamRatings,
  DEFAULT_TEAM_RATINGS,
  BASELINE_RATING,
  normalizeTeamName,
} from './model';

export interface RatingHistoryPoint {
  date: string;
  opponent: string;
  venue: 'home' | 'away';
  score: string;
  attackRating: number;
  defenceRating: number;
  deltaAttack: number;
  deltaDefence: number;
}

export interface DynamicTeamRating {
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
  history: RatingHistoryPoint[];
}

function createInitialRating(
  team: string,
  norm: string,
  sport: SportType,
  hAtt: number,
  aAtt: number,
  hDef: number,
  aDef: number,
  hAdv: number,
  matches: number,
  now: string
): DynamicTeamRating {
  return {
    team,
    normalizedName: norm,
    sport,
    homeAttack: hAtt,
    awayAttack: aAtt,
    homeDefence: hDef,
    awayDefence: aDef,
    homeAdvantage: hAdv,
    matchesAnalyzed: matches,
    lastUpdated: now,
    formTrend: 'stable',
    history: [
      {
        date: '2026-10-01T00:00:00Z',
        opponent: 'Historical Baseline',
        venue: 'home',
        score: 'Baseline',
        attackRating: hAtt,
        defenceRating: hDef,
        deltaAttack: 0,
        deltaDefence: 0,
      },
    ],
  };
}

export class DynamicRatingEngine {
  private ratings: Map<string, DynamicTeamRating> = new Map();
  private learningRate: number;
  private meanReversion: number;

  constructor(learningRate: number = 0.05, meanReversion: number = 0.01) {
    this.learningRate = learningRate;
    this.meanReversion = meanReversion;
    this.initializeFromDefaults();
  }

  private initializeFromDefaults(): void {
    const now = new Date().toISOString();

    // 1. Initialize Soccer ratings from DEFAULT_TEAM_RATINGS
    for (const [normName, base] of Object.entries(DEFAULT_TEAM_RATINGS)) {
      const displayName = normName.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      this.ratings.set(
        normName,
        createInitialRating(displayName, normName, 'soccer', base.homeAttack, base.awayAttack, base.homeDefence, base.awayDefence, base.homeAdvantage, base.matchesAnalyzed, now)
      );
    }

    // 2. Initialize North American Sport baselines (NBA & NHL)
    const extraTeams: Array<[string, string, SportType, number, number, number, number, number, number]> = [
      ['boston celtics', 'Boston Celtics', 'basketball', 1.25, 1.20, 0.78, 0.82, 1.08, 30],
      ['los angeles lakers', 'Los Angeles Lakers', 'basketball', 1.10, 1.05, 0.95, 1.02, 1.08, 30],
      ['golden state warriors', 'Golden State Warriors', 'basketball', 1.15, 1.10, 0.90, 0.98, 1.08, 30],
      ['denver nuggets', 'Denver Nuggets', 'basketball', 1.20, 1.12, 0.85, 0.92, 1.12, 30],
      ['edmonton oilers', 'Edmonton Oilers', 'hockey', 1.30, 1.15, 0.92, 1.05, 1.10, 30],
      ['florida panthers', 'Florida Panthers', 'hockey', 1.20, 1.12, 0.80, 0.88, 1.10, 30],
      ['new york rangers', 'New York Rangers', 'hockey', 1.18, 1.10, 0.82, 0.90, 1.10, 30],
    ];

    for (const [norm, disp, sport, hAtt, aAtt, hDef, aDef, hAdv, matches] of extraTeams) {
      this.ratings.set(norm, createInitialRating(disp, norm, sport, hAtt, aAtt, hDef, aDef, hAdv, matches, now));
    }
  }

  public getTeam(name: string): DynamicTeamRating {
    const norm = normalizeTeamName(name);
    const existing = this.ratings.get(norm);
    if (existing) return existing;

    const newRating = createInitialRating(name, norm, 'soccer', BASELINE_RATING.homeAttack, BASELINE_RATING.awayAttack, BASELINE_RATING.homeDefence, BASELINE_RATING.awayDefence, BASELINE_RATING.homeAdvantage, 0, new Date().toISOString());
    this.ratings.set(norm, newRating);
    return newRating;
  }

  public getAllTeams(sport?: SportType): DynamicTeamRating[] {
    const all = Array.from(this.ratings.values());
    if (sport && (sport as any) !== 'all') {
      return all.filter((t) => t.sport === sport);
    }
    return all;
  }

  /**
   * Applies Bayesian MAP Stochastic Gradient Update after a match result
   */
  public updateFromMatch(
    homeTeamName: string,
    awayTeamName: string,
    homeScore: number,
    awayScore: number,
    matchDate: string = new Date().toISOString(),
    sport: SportType = 'soccer'
  ) {
    const homeTeam = this.getTeam(homeTeamName);
    const awayTeam = this.getTeam(awayTeamName);

    const baselineHome = sport === 'basketball' ? 112 : sport === 'hockey' ? 3.0 : 1.45;
    const baselineAway = sport === 'basketball' ? 108 : sport === 'hockey' ? 2.7 : 1.15;

    const expectedHome = homeTeam.homeAttack * awayTeam.awayDefence * homeTeam.homeAdvantage * baselineHome;
    const expectedAway = awayTeam.awayAttack * homeTeam.homeDefence * baselineAway;

    // Relative scoring error clamped to prevent extreme single-game skew
    const errHome = Math.max(-1.5, Math.min(1.5, (homeScore - expectedHome) / Math.max(0.5, expectedHome)));
    const errAway = Math.max(-1.5, Math.min(1.5, (awayScore - expectedAway) / Math.max(0.5, expectedAway)));

    const deltaHomeAttack = parseFloat((this.learningRate * errHome - this.meanReversion * (homeTeam.homeAttack - 1.0)).toFixed(4));
    const deltaAwayDefence = parseFloat((this.learningRate * errHome - this.meanReversion * (awayTeam.awayDefence - 1.0)).toFixed(4));
    const deltaAwayAttack = parseFloat((this.learningRate * errAway - this.meanReversion * (awayTeam.awayAttack - 1.0)).toFixed(4));
    const deltaHomeDefence = parseFloat((this.learningRate * errAway - this.meanReversion * (homeTeam.homeDefence - 1.0)).toFixed(4));

    homeTeam.homeAttack = Math.max(0.45, Math.min(2.20, parseFloat((homeTeam.homeAttack + deltaHomeAttack).toFixed(3))));
    homeTeam.homeDefence = Math.max(0.45, Math.min(2.20, parseFloat((homeTeam.homeDefence + deltaHomeDefence).toFixed(3))));
    homeTeam.matchesAnalyzed += 1;
    homeTeam.lastUpdated = matchDate;

    awayTeam.awayAttack = Math.max(0.45, Math.min(2.20, parseFloat((awayTeam.awayAttack + deltaAwayAttack).toFixed(3))));
    awayTeam.awayDefence = Math.max(0.45, Math.min(2.20, parseFloat((awayTeam.awayDefence + deltaAwayDefence).toFixed(3))));
    awayTeam.matchesAnalyzed += 1;
    awayTeam.lastUpdated = matchDate;

    homeTeam.history.push({
      date: matchDate, opponent: awayTeam.team, venue: 'home', score: `${homeScore}-${awayScore}`,
      attackRating: homeTeam.homeAttack, defenceRating: homeTeam.homeDefence, deltaAttack: deltaHomeAttack, deltaDefence: deltaHomeDefence,
    });
    if (homeTeam.history.length > 25) homeTeam.history.shift();

    awayTeam.history.push({
      date: matchDate, opponent: homeTeam.team, venue: 'away', score: `${homeScore}-${awayScore}`,
      attackRating: awayTeam.awayAttack, defenceRating: awayTeam.awayDefence, deltaAttack: deltaAwayAttack, deltaDefence: deltaAwayDefence,
    });
    if (awayTeam.history.length > 25) awayTeam.history.shift();

    homeTeam.formTrend = this.calculateFormTrend(homeTeam.history);
    awayTeam.formTrend = this.calculateFormTrend(awayTeam.history);

    return {
      homeUpdates: { deltaAttack: deltaHomeAttack, deltaDefence: deltaHomeDefence, newAttack: homeTeam.homeAttack, newDefence: homeTeam.homeDefence },
      awayUpdates: { deltaAttack: deltaAwayAttack, deltaDefence: deltaAwayDefence, newAttack: awayTeam.awayAttack, newDefence: awayTeam.awayDefence },
    };
  }

  private calculateFormTrend(history: RatingHistoryPoint[]): 'improving' | 'declining' | 'stable' {
    if (history.length < 3) return 'stable';
    const recent = history.slice(-3);
    const netChange = recent.reduce((sum, h) => sum + h.deltaAttack - h.deltaDefence, 0);
    if (netChange > 0.02) return 'improving';
    if (netChange < -0.02) return 'declining';
    return 'stable';
  }

  public getAsMap(): Map<string, TeamRatings> {
    const map = new Map<string, TeamRatings>();
    for (const [key, val] of this.ratings.entries()) {
      map.set(key, {
        homeAttack: val.homeAttack,
        awayAttack: val.awayAttack,
        homeDefence: val.homeDefence,
        awayDefence: val.awayDefence,
        homeAdvantage: val.homeAdvantage,
        matchesAnalyzed: val.matchesAnalyzed,
      });
    }
    return map;
  }
}

export const dynamicRatingEngine = new DynamicRatingEngine();
