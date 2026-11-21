// Bankroll Journal & Bet Performance Tracking

export interface BetRecord {
  id: string;
  fixtureId: number;
  match: string;
  market: string;
  outcome: string;
  modelProb: number;
  odds: number;
  impliedProb: number;
  edgePercent: number;
  expectedValue: number;
  stake: number;
  stakePercent: number;
  status: 'pending' | 'won' | 'lost' | 'void';
  pnl: number;
  placedAt: string;
  settledAt?: string;
  actualScore?: string;
}

export interface JournalStats {
  initialBankroll: number;
  currentBankroll: number;
  netProfit: number;
  roiPercent: number;
  totalBets: number;
  pendingBets: number;
  settledBets: number;
  wonBets: number;
  lostBets: number;
  voidBets: number;
  winRate: number;
  totalStaked: number;
  totalReturned: number;
  maxDrawdownPercent: number;
  maxDrawdownAmount: number;
  brierScore: number | null; // Probability calibration metric
  equityCurve: Array<{ betId: string; bankroll: number; pnl: number; timestamp: string }>;
}

export class BankrollJournal {
  private initialBankroll: number;
  private currentBankroll: number;
  private bets: Map<string, BetRecord> = new Map();
  private nextId: number = 1;

  constructor(initialBankroll: number = 1000) {
    this.initialBankroll = initialBankroll;
    this.currentBankroll = initialBankroll;
  }

  public getBankroll(): number {
    return parseFloat(this.currentBankroll.toFixed(2));
  }

  public setInitialBankroll(amount: number): void {
    if (amount > 0) {
      const diff = amount - this.initialBankroll;
      this.initialBankroll = amount;
      this.currentBankroll += diff;
    }
  }

  public placeBet(params: {
    fixtureId: number;
    match: string;
    market?: string;
    outcome: string;
    modelProb: number;
    odds: number;
    stake: number;
    edgePercent?: number;
    expectedValue?: number;
  }): BetRecord {
    if (params.stake <= 0) {
      throw new Error('Stake must be greater than zero');
    }
    if (params.stake > this.currentBankroll) {
      throw new Error(`Stake (${params.stake}) exceeds available bankroll (${this.currentBankroll.toFixed(2)})`);
    }

    const id = `bet-${this.nextId++}`;
    const impliedProb = params.odds > 0 ? parseFloat(((1 / params.odds) * 100).toFixed(2)) : 0;
    const edgePercent = params.edgePercent ?? parseFloat((params.modelProb - impliedProb).toFixed(2));
    const ev = params.expectedValue ?? parseFloat(((params.modelProb / 100) * params.odds - 1).toFixed(4));
    const stakePercent = parseFloat(((params.stake / this.currentBankroll) * 100).toFixed(2));

    const bet: BetRecord = {
      id,
      fixtureId: params.fixtureId,
      match: params.match,
      market: params.market || '1X2',
      outcome: params.outcome,
      modelProb: params.modelProb,
      odds: params.odds,
      impliedProb,
      edgePercent,
      expectedValue: ev,
      stake: params.stake,
      stakePercent,
      status: 'pending',
      pnl: 0,
      placedAt: new Date().toISOString(),
    };

    // Deduct stake from available bankroll while pending
    this.currentBankroll -= params.stake;
    this.bets.set(id, bet);
    return bet;
  }

  public settleBet(id: string, status: 'won' | 'lost' | 'void', actualScore?: string): BetRecord {
    const bet = this.bets.get(id);
    if (!bet) {
      throw new Error(`Bet not found: ${id}`);
    }
    if (bet.status !== 'pending') {
      throw new Error(`Bet ${id} is already settled as ${bet.status}`);
    }

    bet.status = status;
    bet.settledAt = new Date().toISOString();
    if (actualScore) {
      bet.actualScore = actualScore;
    }

    if (status === 'won') {
      const returnAmount = bet.stake * bet.odds;
      bet.pnl = parseFloat((returnAmount - bet.stake).toFixed(2));
      this.currentBankroll += returnAmount;
    } else if (status === 'lost') {
      bet.pnl = -bet.stake;
      // Stake was already deducted upon placement
    } else if (status === 'void') {
      bet.pnl = 0;
      this.currentBankroll += bet.stake; // Refund stake
    }

    return bet;
  }

  public getBets(filter?: { status?: string; fixtureId?: number }): BetRecord[] {
    const all = Array.from(this.bets.values());
    return all.filter((b) => {
      if (filter?.status && b.status !== filter.status) return false;
      if (filter?.fixtureId && b.fixtureId !== filter.fixtureId) return false;
      return true;
    });
  }

  public getStats(): JournalStats {
    const allBets = Array.from(this.bets.values());
    const settled = allBets.filter((b) => b.status !== 'pending');
    const won = settled.filter((b) => b.status === 'won');
    const lost = settled.filter((b) => b.status === 'lost');
    const voidBets = settled.filter((b) => b.status === 'void');

    const totalStaked = settled.reduce((sum, b) => sum + b.stake, 0);
    const totalReturned = settled.reduce((sum, b) => {
      if (b.status === 'won') return sum + b.stake * b.odds;
      if (b.status === 'void') return sum + b.stake;
      return sum;
    }, 0);

    const netProfit = parseFloat((totalReturned - totalStaked).toFixed(2));
    const roiPercent = totalStaked > 0 ? parseFloat(((netProfit / totalStaked) * 100).toFixed(2)) : 0;
    const effectiveSettled = won.length + lost.length;
    const winRate = effectiveSettled > 0 ? parseFloat(((won.length / effectiveSettled) * 100).toFixed(2)) : 0;

    // Equity curve & Max Drawdown
    let runningBankroll = this.initialBankroll;
    let peak = this.initialBankroll;
    let maxDrawdownAmount = 0;
    let maxDrawdownPercent = 0;

    const equityCurve: Array<{ betId: string; bankroll: number; pnl: number; timestamp: string }> = [
      { betId: 'initial', bankroll: this.initialBankroll, pnl: 0, timestamp: new Date(0).toISOString() },
    ];

    for (const b of settled) {
      runningBankroll += b.pnl;
      if (runningBankroll > peak) {
        peak = runningBankroll;
      }
      const ddAmount = peak - runningBankroll;
      const ddPct = peak > 0 ? (ddAmount / peak) * 100 : 0;
      if (ddAmount > maxDrawdownAmount) maxDrawdownAmount = ddAmount;
      if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

      equityCurve.push({
        betId: b.id,
        bankroll: parseFloat(runningBankroll.toFixed(2)),
        pnl: b.pnl,
        timestamp: b.settledAt || b.placedAt,
      });
    }

    // Brier score calculation: sum of (modelProb - outcome)^2 / N
    let brierScore: number | null = null;
    if (effectiveSettled > 0) {
      let brierSum = 0;
      for (const b of settled) {
        if (b.status === 'void') continue;
        const actual = b.status === 'won' ? 1 : 0;
        const p = b.modelProb / 100;
        brierSum += Math.pow(p - actual, 2);
      }
      brierScore = parseFloat((brierSum / effectiveSettled).toFixed(4));
    }

    return {
      initialBankroll: this.initialBankroll,
      currentBankroll: parseFloat(this.currentBankroll.toFixed(2)),
      netProfit,
      roiPercent,
      totalBets: allBets.length,
      pendingBets: allBets.length - settled.length,
      settledBets: settled.length,
      wonBets: won.length,
      lostBets: lost.length,
      voidBets: voidBets.length,
      winRate,
      totalStaked: parseFloat(totalStaked.toFixed(2)),
      totalReturned: parseFloat(totalReturned.toFixed(2)),
      maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
      maxDrawdownAmount: parseFloat(maxDrawdownAmount.toFixed(2)),
      brierScore,
      equityCurve,
    };
  }
}
