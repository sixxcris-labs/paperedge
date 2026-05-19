/**
 * Lock a verified TradeOpportunity into a real PaperTrade row.
 *
 * This is the single conversion point from the verifier-app operational model
 * (`TradeOpportunity`) to the dashboard-app contract model (`PaperTrade`). It
 * must be transactional: either the `PaperTrade` row + its `TradeLeg` rows are
 * written AND the opportunity's status flips to `locked` AND
 * `lockedTradeId` is wired up, or none of those happen.
 *
 * See ADR-001 for why this conversion exists. Callers come from the verifier
 * app's lock flow (Step 9 of the plan); the dashboard does not call this.
 */

import type { PrismaClient } from "./generated/prisma/client";
import { cashArbHedge, lowHold, middleHedge, promoHedge } from "./calc";

export interface LockOpportunityResult {
  paperTradeId: string;
  opportunityId: string;
}

export class LockOpportunityError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "LockOpportunityError";
  }
}

/**
 * Promote a verified opportunity to a locked PaperTrade.
 *
 * Preconditions enforced inside the transaction:
 *   - opportunity exists and belongs to userId,
 *   - opportunity is not already locked, skipped, or failed,
 *   - both books are present and verified,
 *   - both legs have observed/expected odds + stakes,
 *   - all market-match checks are confirmed (sameEvent, sameMarket, etc.),
 *   - userFinalConfirm is true.
 *
 * Throws `LockOpportunityError` with a stable `.code` so the caller can map
 * to a UX message without parsing message strings.
 */
export async function lockOpportunityAsPaperTrade(
  db: PrismaClient,
  opportunityId: string,
  userId: string,
): Promise<LockOpportunityResult> {
  return db.$transaction(async (tx) => {
    const opp = await tx.tradeOpportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opp) {
      throw new LockOpportunityError(
        `Opportunity ${opportunityId} not found`,
        "NOT_FOUND",
      );
    }
    if (opp.userId !== userId) {
      throw new LockOpportunityError(
        `Opportunity ${opportunityId} does not belong to user ${userId}`,
        "OWNERSHIP",
      );
    }
    if (opp.status === "locked" || opp.lockedTradeId) {
      throw new LockOpportunityError(
        `Opportunity ${opportunityId} is already locked`,
        "ALREADY_LOCKED",
      );
    }
    if (
      opp.status === "skipped" ||
      opp.status.startsWith("failed_")
    ) {
      throw new LockOpportunityError(
        `Opportunity ${opportunityId} is in terminal state "${opp.status}"`,
        "TERMINAL_STATE",
      );
    }

    // Verification gate. Each check failure has a distinct code so the UI can
    // point at the specific control that needs attention.
    const gates: Array<[boolean, string, string]> = [
      [opp.bookAVerified, "BOOK_A_NOT_VERIFIED", "Book A leg has not been verified"],
      [opp.bookBVerified, "BOOK_B_NOT_VERIFIED", "Book B leg has not been verified"],
      [opp.sameEventConfirmed, "SAME_EVENT", "Same-event check not confirmed"],
      [opp.sameMarketConfirmed, "SAME_MARKET", "Same-market check not confirmed"],
      [opp.samePeriodConfirmed, "SAME_PERIOD", "Same-period check not confirmed"],
      [opp.oppositeSidesConfirmed, "OPPOSITE_SIDES", "Opposite-sides check not confirmed"],
      [opp.sameLineConfirmed, "SAME_LINE", "Same-line check not confirmed (middle gap for middles)"],
      [opp.recalculatedConfirmed, "RECALCULATED", "Stakes not recalculated against observed odds"],
      [opp.userFinalConfirm, "FINAL_CONFIRM", "Final user confirmation required"],
    ];
    for (const [ok, code, msg] of gates) {
      if (!ok) throw new LockOpportunityError(msg, code);
    }

    // Required scalars.
    if (!opp.bookAId || !opp.bookBId) {
      throw new LockOpportunityError(
        "Both books must be set before locking",
        "MISSING_BOOK",
      );
    }
    if (!opp.sideA || !opp.sideB) {
      throw new LockOpportunityError(
        "Both leg sides must be set before locking",
        "MISSING_SIDE",
      );
    }
    const oddsA = opp.verifiedOddsA ?? opp.oddsA;
    const oddsB = opp.verifiedOddsB ?? opp.oddsB;
    const stakeA = opp.stakeA;
    const stakeB = opp.stakeB;
    if (oddsA == null || oddsB == null) {
      throw new LockOpportunityError(
        "Both legs must have odds before locking",
        "MISSING_ODDS",
      );
    }
    if (stakeA == null || stakeB == null) {
      throw new LockOpportunityError(
        "Both legs must have stakes before locking",
        "MISSING_STAKE",
      );
    }

    // Recompute expected P/L from the verified figures so the locked
    // PaperTrade reflects the observed-odds reality, not the imported
    // OddsJam snapshot. Calculator picked by tradeType.
    const econ = computeEconomics({
      tradeType: opp.tradeType,
      oddsA,
      oddsB,
      stakeA,
      stakeB,
      lineA: opp.verifiedLineA ?? opp.lineA,
      lineB: opp.verifiedLineB ?? opp.lineB,
    });

    const paperTrade = await tx.paperTrade.create({
      data: {
        userId,
        tradeDate: opp.startTime ?? new Date(),
        sport: opp.sport,
        league: opp.league,
        eventName: opp.event,
        marketType: opp.market,
        gamePeriod: opp.period,
        lineValue: opp.verifiedLineA ?? opp.lineA,
        tradeType: opp.tradeType,
        bonusType: "none",
        goal: defaultGoalForTradeType(opp.tradeType),
        requiredCalculator: calculatorForTradeType(opp.tradeType),
        status: "paper_traded",
        source: opp.source,
        oddsjamSnapshotJson: opp.rawEntryText,
        importedAt: opp.importedAt,
        expectedProfitIfA: econ.profitIfA,
        expectedProfitIfB: econ.profitIfB,
        worstCasePL: econ.worstCase,
        bestCasePL: econ.bestCase,
        totalStakeExposure: stakeA + stakeB,
        hedgeStake: stakeB,
        notes: opp.notes,
        player: opp.playerOrTeam,
        legs: {
          create: [
            {
              legLabel: "A",
              bookId: opp.bookAId,
              side: opp.sideA,
              oddsAmerican: oddsA,
              lineValue: opp.verifiedLineA ?? opp.lineA,
              stake: stakeA,
              oddsCapturedAt: opp.verifiedAt ?? opp.importedAt,
              verificationStatus: "verified",
              verifiedAt: opp.verifiedAt,
              observedOddsAmerican: opp.verifiedOddsA,
              observedLineValue: opp.verifiedLineA,
              observationNotes: opp.bookANotes,
            },
            {
              legLabel: "B",
              bookId: opp.bookBId,
              side: opp.sideB,
              oddsAmerican: oddsB,
              lineValue: opp.verifiedLineB ?? opp.lineB,
              stake: stakeB,
              oddsCapturedAt: opp.verifiedAt ?? opp.importedAt,
              verificationStatus: "verified",
              verifiedAt: opp.verifiedAt,
              observedOddsAmerican: opp.verifiedOddsB,
              observedLineValue: opp.verifiedLineB,
              observationNotes: opp.bookBNotes,
            },
          ],
        },
      },
    });

    await tx.tradeOpportunity.update({
      where: { id: opp.id },
      data: {
        status: "locked",
        lockedAt: new Date(),
        lockedTradeId: paperTrade.id,
      },
    });

    return { paperTradeId: paperTrade.id, opportunityId: opp.id };
  });
}

// ─── Internal helpers ───────────────────────────────────────────────────────

interface EconomicsInput {
  tradeType: string;
  oddsA: number;
  oddsB: number;
  stakeA: number;
  stakeB: number;
  lineA: number | null | undefined;
  lineB: number | null | undefined;
}

interface Economics {
  profitIfA: number;
  profitIfB: number;
  worstCase: number;
  bestCase: number;
}

function computeEconomics(i: EconomicsInput): Economics {
  // For middles, both legs can win simultaneously; the best case is the
  // middle hit and the worst case is the outside loss. For everything else,
  // the legs are mutually exclusive — one wins, one loses.
  if (i.tradeType === "middle" && i.lineA != null && i.lineB != null) {
    const r = middleHedge(
      i.stakeA,
      i.oddsA,
      i.lineA,
      i.stakeB,
      i.oddsB,
      Math.max(i.lineA, i.lineB),
    );
    return {
      profitIfA: r.plOutsideHigh,
      profitIfB: r.plOutsideLow,
      worstCase: r.outsideLoss,
      bestCase: r.middleProfit,
    };
  }

  if (i.tradeType === "promo_conversion") {
    const r = promoHedge(i.stakeA, i.oddsA, i.oddsB);
    return {
      profitIfA: r.lockedProfit,
      profitIfB: r.lockedProfit,
      worstCase: r.lockedProfit,
      bestCase: r.lockedProfit,
    };
  }

  if (i.tradeType === "low_hold" || i.tradeType === "rollover_clearing") {
    const r = lowHold(i.stakeA, i.oddsA, i.stakeB, i.oddsB);
    return {
      profitIfA: r.profitIfA,
      profitIfB: r.profitIfB,
      worstCase: Math.min(r.profitIfA, r.profitIfB),
      bestCase: Math.max(r.profitIfA, r.profitIfB),
    };
  }

  // Default: cash arbitrage shape.
  const r = cashArbHedge(i.stakeA, i.oddsA, i.oddsB);
  return {
    profitIfA: r.profitIfA,
    profitIfB: r.profitIfB,
    worstCase: Math.min(r.profitIfA, r.profitIfB),
    bestCase: Math.max(r.profitIfA, r.profitIfB),
  };
}

function calculatorForTradeType(tradeType: string): string {
  switch (tradeType) {
    case "promo_conversion": return "promo_converter";
    case "low_hold":
    case "rollover_clearing": return "low_holds";
    case "screener_comparison": return "screener";
    default: return "arbitrage";
  }
}

function defaultGoalForTradeType(tradeType: string): string {
  switch (tradeType) {
    case "promo_conversion": return "convert_promo";
    case "low_hold":
    case "rollover_clearing": return "clear_rollover";
    case "cash_bonus_conversion": return "collect_bonus";
    case "screener_comparison": return "practice";
    default: return "cash_arb_profit";
  }
}
