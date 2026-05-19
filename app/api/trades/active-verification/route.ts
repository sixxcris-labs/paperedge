import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const LOCAL_USER_EMAIL = "local@paperedge.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });
  const settings = await db.userSettings.findUnique({
    where: { userId: user.id },
  });

  if (!settings?.activeVerificationTradeId) {
    return NextResponse.json(null, { headers: corsHeaders });
  }

  const trade = await db.paperTrade.findUnique({
    where: { id: settings.activeVerificationTradeId },
    include: { legs: { include: { book: true } } },
  });

  return NextResponse.json(trade, { headers: corsHeaders });
}
