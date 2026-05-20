import { NextResponse } from "next/server";
import { db } from "@paperedge/database";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { legId, status, observedOddsAmerican, observedLineValue, notes } =
    await req.json();

  await db.tradeLeg.update({
    where: { id: legId },
    data: {
      verificationStatus: status,
      observedOddsAmerican: observedOddsAmerican ?? null,
      observedLineValue: observedLineValue ?? null,
      observationNotes: notes ?? null,
      verifiedAt: new Date(),
    },
  });

  // If all legs have a terminal verification status, update the trade
  const trade = await db.paperTrade.findUnique({
    where: { id },
    include: { legs: true },
  });

  if (trade) {
    const allDone = trade.legs.every((l) => l.verificationStatus !== "unverified");
    const allVerified = trade.legs.every((l) => l.verificationStatus === "verified");

    if (allVerified) {
      await db.paperTrade.update({
        where: { id },
        data: { status: "verified" },
      });
    } else if (allDone) {
      // At least one leg failed — determine which failure status to use
      const firstFailed = trade.legs.find(
        (l) => l.verificationStatus !== "verified"
      );
      const failureMap: Record<string, string> = {
        line_moved: "not_placed_line_moved",
        odds_moved: "not_placed_odds_moved",
        market_unavailable: "not_placed_market_unavailable",
        player_not_listed: "not_placed_player_not_listed",
        book_unavailable: "not_placed_book_unavailable",
      };
      const tradeStatus =
        failureMap[firstFailed?.verificationStatus ?? ""] ?? "not_placed_other";
      await db.paperTrade.update({
        where: { id },
        data: { status: tradeStatus },
      });
    }
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
