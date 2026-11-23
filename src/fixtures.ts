// Local-First Shelf Fixtures Repository
// Pre-populated with realistic fixtures across Football, Basketball (NBA), Ice Hockey (NHL), and Tennis (ATP).

import { SportType, LiveStats } from './model';
import { MarketOdds } from './valueBetting';

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

export interface MatchData {
  fixtureId: number;
  sport: SportType;
  country: string;
  homeTeam: string;
  awayTeam: string;
  kickoffDate: string;
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

export const DEFAULT_SHELF_FIXTURES: MatchData[] = [
  // 1. England: Premier League (Soccer)
  {
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
  },

  // 2. Spain: La Liga (Soccer)
  {
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
  },

  // 3. Italy: Serie A (Soccer)
  {
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
  },

  // 4. Germany: Bundesliga (Soccer)
  {
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
  },

  // 5. USA: Major League Soccer (Soccer)
  {
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
  },

  // 6. USA: Basketball (NBA)
  {
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
  },

  // 7. USA/Canada: Ice Hockey (NHL)
  {
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
  },

  // 8. International: Tennis (ATP)
  {
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
  },
];
