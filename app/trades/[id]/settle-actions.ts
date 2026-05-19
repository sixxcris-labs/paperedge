"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { STATUS, isSettled } from "@/lib/status";

const LOCAL_USER_EMAIL = "local@paperedge.app";

/** Statuses that cannot be re-settled or mutated. */
const isLocked = (status: string) => isSettled(status) || status === STATUS.cancelled;

const SettleSchema = z.object({
  winningSide: z.string(),
  finalStat: z.string().optional(),
  actualPayout: z.coerce.number().default(0),
  losingStake: z.coerce.number().default(0),   // was: losingSake (typo fixed)
  actualProfitLoss: z.coerce.number(),
  resultNotes: z.string().optional(),
  matchedExpectedOutcome: z.coerce.boolean().default(false),
  mistakeTagIds: z.array(z.string()).default([]),
  mistakeNotes: z.string().optional(),
});

export async function settleTrade(tradeId: string, formData: FormData) {
  // Verify ownership and guard against re-settling a locked trade.
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const trade = await db.paperTrade.findUnique({
    where: { id: tradeId },
    include: { result: true },
  });

  if (!trade) throw new Error("Trade not found");
  if (trade.userId !== user.id) throw new Error("Unauthorised");
  if (isLocked(trade.status)) {
    throw new Error("This trade is already settled and cannot be changed.");
  }

  const raw = {
    winningSide:            formData.get("winningSide"),
    finalStat:              formData.get("finalStat"),
    actualPayout:           formData.get("actualPayout"),
    losingStake:            formData.get("losingStake") ?? formData.get("losingSake") ?? "0",
    actualProfitLoss:       formData.get("actualProfitLoss"),
    matchedExpectedOutcome: formData.get("matchedExpectedOutcome") === "true",
    resultNotes:            formData.get("resultNotes"),
    mistakeTagIds:          formData.getAll("mistakeTagIds"),
    mistakeNotes:           formData.get("mistakeNotes"),
  };
  const data = SettleSchema.parse(raw);

  const winningSide = data.winningSide;
  let status: string;
  if (winningSide === "push" || winningSide === "void") {
    status = "settled_push_void";
  } else if (data.actualProfitLoss < 0) {
    status = "settled_loss";
  } else {
    status = "settled_win";
  }

  await db.result.upsert({
    where: { tradeId },
    update: {
      winningSide,
      finalStat:              data.finalStat ?? null,
      actualPayout:           data.actualPayout,
      actualProfitLoss:       data.actualProfitLoss,
      matchedExpectedOutcome: data.matchedExpectedOutcome,
      resultNotes:            data.resultNotes,
      settledAt:              new Date(),
    },
    create: {
      tradeId,
      winningSide,
      finalStat:              data.finalStat ?? null,
      actualPayout:           data.actualPayout,
      actualProfitLoss:       data.actualProfitLoss,
      matchedExpectedOutcome: data.matchedExpectedOutcome,
      resultNotes:            data.resultNotes,
      settledAt:              new Date(),
    },
  });

  await db.paperTrade.update({
    where: { id: tradeId },
    data: { status },
  });

  // Update bankroll — only if this trade did not already have a settled result
  // (i.e. this is the first settlement, not a re-settlement). Re-settling is
  // blocked above, but if we ever relax that guard the bankroll won't double-count.
  if (!trade.result?.settledAt) {
    const settings = await db.userSettings.findUnique({ where: { userId: user.id } });
    if (settings) {
      await db.userSettings.update({
        where: { userId: user.id },
        data: { currentBankroll: settings.currentBankroll + data.actualProfitLoss },
      });
    }
  }

  // Log mistakes
  if (data.mistakeTagIds.length > 0) {
    await db.tradeMistake.createMany({
      data: data.mistakeTagIds.map((tagId) => ({
        tradeId,
        mistakeTagId: tagId,
        notes: data.mistakeNotes ?? null,
      })),
    });
  }

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
  revalidatePath("/");
}

export async function updateTradeStatus(tradeId: string, status: string) {
  // Prevent mutating already-settled trades through this shortcut.
  const trade = await db.paperTrade.findUnique({ where: { id: tradeId } });
  if (trade && isLocked(trade.status)) {
    throw new Error("Cannot change status of a settled trade.");
  }
  await db.paperTrade.update({ where: { id: tradeId }, data: { status } });
  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
}
