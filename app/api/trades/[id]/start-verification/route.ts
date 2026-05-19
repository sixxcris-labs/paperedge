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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });

  await db.userSettings.update({
    where: { userId: user.id },
    data: { activeVerificationTradeId: id },
  });

  await db.paperTrade.update({
    where: { id },
    data: { status: "verifying" },
  });

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
