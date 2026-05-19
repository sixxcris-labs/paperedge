import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const LOCAL_USER_EMAIL = "local@paperedge.app";

export async function POST(req: Request) {
  const { raw } = await req.json();

  const user = await db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });

  const trade = await db.paperTrade.create({
    data: {
      userId: user.id,
      tradeDate: new Date(),
      sport: "unknown",
      eventName: "Pending verification",
      marketType: "moneyline",
      gamePeriod: "full_game",
      tradeType: "cash_arbitrage",
      bonusType: "none",
      goal: "cash_arb_profit",
      requiredCalculator: "arbitrage",
      status: "unverified",
      source: "oddsjam_paste",
      oddsjamSnapshotJson: raw,
      importedAt: new Date(),
    },
  });

  return NextResponse.json({ id: trade.id });
}
