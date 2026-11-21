// Dynamic Bayesian Rating Engine with Time-Decay & Stochastic Gradient Updating
// Implements continuous parameter learning for team attacking & defensive ratings.
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

export class DynamicRatingEngine {
  private ratings: Map<string, DynamicTeamRating> = new Map();
  private learningRate: number; // eta (learning step)
  private meanReversion: number; // gamma (shrinkage towards league average)

  constructor(learningRate: number = 0.05, meanReversion: number = 0.01) {
    this.learningRate = learningRate;
    this.meanReversion = meanReversion;
    this.initializeFromDefaults();
  }

  private initializeFromDefaults(): void {
    const now = new Date().toISOString();

    for (const [normName, base] of Object.entries(DEFAULT_TEAM_RATINGS)) {
      const displayName = normName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      this.ratings.set(normName, {
        team: displayName,
        normalizedName: normName,
        sport: 'soccer',
        homeAttack: base.homeAttack,
        awayAttack: base.awayAttack,
        homeDefence: base.homeDefence,
        awayDefence: base.awayDefence,
        homeAdvantage: base.homeAdvantage,
        matchesAnalyzed: base.matchesAnalyzed,
        lastUpdated: now,
        formTrend: 'stable',
        history: [
          {
            date: '2026-10-01T00:00:00Z',
            opponent: 'Historical Baseline',
            venue: 'home',
            score: 'Baseline',
            attackRating: base.homeAttack,
            defenceRating: base.homeDefence,
            deltaAttack: 0,
            deltaDefence: 0,
          },
        ],
      });
    }

    // NBA Teams
    this.addTeamRating('boston celtics', 'Boston Celtics', 'basketball', 1.25, 1.20, 0.78, 0.82, 1.08, 30);
    this.addTeamRating('los angeles lakers', 'Los Angeles Lakers', 'basketball', 1.10, 1.05, 0.95, 1.02, 1.08, 30);
    this.addTeamRating('golden state warriors', 'Golden State Warriors', 'basketball', 1.15, 1.10, 0.90, 0.98, 1.08, 30);
    this.addTeamRating('denver nuggets', 'Denver Nuggets', 'basketball', 1.20, 1.12, 0.85, 0.92, 1.12, 30);

    // NHL Teams
    this.addTeamRating('edmonton oilers', 'Edmonton Oilers', 'hockey', 1.30, 1.15, 0.92, 1.05, 1.10, 30);
    this.addTeamRating('florida panthers', 'Florida Panthers', 'hockey', 1.20, 1.12, 0.80, 0.88, 1.10, 30);
    this.addTeamRating('new york rangers', 'New York Rangers', 'hockey', 1.18, 1.10, 0.82, 0.90, 1.10, 30);
  }

  private addTeamRating(
    norm: string,
    display: string,
    sport: SportType,
    hAtt: number,
    aAtt: number,
    hDef: number,
    aDef: number,
    hAdv: number,
    matches: number
  ) {
    this.ratings.set(norm, {
      team: display,
      normalizedName: norm,
      sport,
      homeAttack: hAtt,
      awayAttack: aAtt,
      homeDefence: hDef,
      awayDefence: aDef,
      homeAdvantage: hAdv,
      matchesAnalyzed: matches,
      lastUpdated: new Date().toISOString(),
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
    });
  }

  public getTeam(name: string): DynamicTeamRating {
    const norm = normalizeTeamName(name);
    const existing = this.ratings.get(norm);
    if (existing) return existing;

    // Create dynamically for unknown teams
    const newRating: DynamicTeamRating = {
      team: name,
      normalizedName: norm,
      sport: 'soccer',
      homeAttack: BASELINE_RATING.homeAttack,
      awayAttack: BASELINE_RATING.awayAttack,
      homeDefence: BASELINE_RATING.homeDefence,
      awayDefence: BASELINE_RATING.awayDefence,
      homeAdvantage: BASELINE_RATING.homeAdvantage,
      matchesAnalyzed: 0,
      lastUpdated: new Date().toISOString(),
      formTrend: 'stable',
      history: [],
    };
    this.ratings.set(norm, newRating);
    return newRating;
  }

  public getAllTeams(sport?: SportType): DynamicTeamRating[] {
    const all = Array.from(this.ratings.values());
    if (sport && sport !== ('all' as any)) {
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
  ): {
    homeUpdates: { deltaAttack: number; deltaDefence: number; newAttack: number; newDefence: number };
    awayUpdates: { deltaAttack: number; deltaDefence: number; newAttack: number; newDefence: number };
  } {
    const homeTeam = this.getTeam(homeTeamName);
    const awayTeam = this.getTeam(awayTeamName);

    // Expected intensity
    const baselineHome = sport === 'basketball' ? 112 : sport === 'hockey' ? 3.0 : 1.45;
    const baselineAway = sport === 'basketball' ? 108 : sport === 'hockey' ? 2.7 : 1.15;

    const expectedHome = homeTeam.homeAttack * awayTeam.awayDefence * homeTeam.homeAdvantage * baselineHome;
    const expectedAway = awayTeam.awayAttack * homeTeam.homeDefence * baselineAway;

    // Relative scoring error
    const errHome = (homeScore - expectedHome) / Math.max(0.5, expectedHome);
    const errAway = (awayScore - expectedAway) / Math.max(0.5, expectedAway);

    // Clamp gradients to avoid excessive volatility from extreme single matches (e.g. 7-0)
    const clampedErrHome = Math.max(-1.5, Math.min(1.5, errHome));
    const clampedErrAway = Math.max(-1.5, Math.min(1.5, errAway));

    // Gradient updates:
    // When home scores MORE than expected: home attack goes UP, away defence (conceding rate) goes UP (worse)
    // When away scores LESS than expected: away attack goes DOWN, home defence (conceding rate) goes DOWN (better)
    const deltaHomeAttack = parseFloat((this.learningRate * clampedErrHome - this.meanReversion * (homeTeam.homeAttack - 1.0)).toFixed(4));
    const deltaAwayDefence = parseFloat((this.learningRate * clampedErrHome - this.meanReversion * (awayTeam.awayDefence - 1.0)).toFixed(4));

    const deltaAwayAttack = parseFloat((this.learningRate * clampedErrAway - this.meanReversion * (awayTeam.awayAttack - 1.0)).toFixed(4));
    const deltaHomeDefence = parseFloat((this.learningRate * clampedErrAway - this.meanReversion * (homeTeam.homeDefence - 1.0)).toFixed(4));

    // Apply updates within reasonable bounds [0.45, 2.20]
    homeTeam.homeAttack = Math.max(0.45, Math.min(2.20, parseFloat((homeTeam.homeAttack + deltaHomeAttack).toFixed(3))));
    homeTeam.homeDefence = Math.max(0.45, Math.min(2.20, parseFloat((homeTeam.homeDefence + deltaHomeDefence).toFixed(3))));
    homeTeam.matchesAnalyzed += 1;
    homeTeam.lastUpdated = matchDate;

    awayTeam.awayAttack = Math.max(0.45, Math.min(2.20, parseFloat((awayTeam.awayAttack + deltaAwayAttack).toFixed(3))));
    awayTeam.awayDefence = Math.max(0.45, Math.min(2.20, parseFloat((awayTeam.awayDefence + deltaAwayDefence).toFixed(3))));
    awayTeam.matchesAnalyzed += 1;
    awayTeam.lastUpdated = matchDate;

    // Record histories
    homeTeam.history.push({
      date: matchDate,
      opponent: awayTeam.team,
      venue: 'home',
      score: `${homeScore}-${awayScore}`,
      attackRating: homeTeam.homeAttack,
      defenceRating: homeTeam.homeDefence,
      deltaAttack: deltaHomeAttack,
      deltaDefence: deltaHomeDefence,
    });
    if (homeTeam.history.length > 25) homeTeam.history.shift();

    awayTeam.history.push({
      date: matchDate,
      opponent: homeTeam.team,
      venue: 'away',
      score: `${homeScore}-${awayScore}`,
      attackRating: awayTeam.awayAttack,
      defenceRating: awayTeam.awayDefence,
      deltaAttack: deltaAwayAttack,
      deltaDefence: deltaAwayDefence,
    });
    if (awayTeam.history.length > 25) awayTeam.history.shift();

    // Determine form trends based on last 3 adjustments
    homeTeam.formTrend = this.calculateFormTrend(homeTeam.history);
    awayTeam.formTrend = this.calculateFormTrend(awayTeam.history);

    return {
      homeUpdates: {
        deltaAttack: deltaHomeAttack,
        deltaDefence: deltaHomeDefence,
        newAttack: homeTeam.homeAttack,
        newDefence: homeTeam.homeDefence,
      },
      awayUpdates: {
        deltaAttack: deltaAwayAttack,
        deltaDefence: deltaAwayDefence,
        newAttack: awayTeam.awayAttack,
        newDefence: awayTeam.awayDefence,
      },
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

// Global dynamic ratings instance
export const dynamicRatingEngine = new DynamicRatingEngine();
