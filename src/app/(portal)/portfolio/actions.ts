"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { actorOrThrow } from "@/server/auth/session";
import { run, str } from "@/server/action-utils";
import {
  addPortfolioFoundation,
  addToPortfolio,
  createFoundation,
  deleteTransaction,
  removeFromPortfolio,
  removePortfolioFoundation,
  saveTransaction,
  saveTransferOrder,
  updatePortfolioFoundation,
} from "@/server/services/portfolio";

const done = (customerId: string, msg: string): ActionState => {
  revalidatePath(`/portfolio/${customerId}`);
  revalidatePath("/portfolio");
  revalidatePath(`/kunden/${customerId}`);
  return { success: msg };
};

export async function addToPortfolioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await addToPortfolio(actor, str(fd, "customerId"));
    return done(str(fd, "customerId"), "Kunde ins Portfolio aufgenommen.");
  });
}

export async function removeFromPortfolioAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await removeFromPortfolio(actor, str(fd, "customerId"));
    return done(str(fd, "customerId"), "Kunde aus dem Portfolio entfernt.");
  });
}

/** Resolves an existing foundation or creates a new one from the free-text field. */
async function foundationFrom(fd: FormData) {
  const id = str(fd, "foundationId");
  if (id && id !== "__neu") return id;
  const actor = await actorOrThrow("portfolio.edit");
  return createFoundation(actor, str(fd, "newFoundationName"), str(fd, "newFoundationAddress"));
}

export async function addFoundationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    const foundationId = await foundationFrom(fd);
    await addPortfolioFoundation(actor, str(fd, "customerId"), { foundationId, accountOpenedOn: str(fd, "accountOpenedOn"), remark: str(fd, "remark") });
    return done(str(fd, "customerId"), "Stiftung hinterlegt.");
  });
}

export async function updateFoundationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await updatePortfolioFoundation(actor, str(fd, "customerId"), str(fd, "pfId"), { foundationId: str(fd, "foundationId"), accountOpenedOn: str(fd, "accountOpenedOn"), remark: str(fd, "remark") });
    return done(str(fd, "customerId"), "Gespeichert.");
  });
}

export async function removeFoundationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await removePortfolioFoundation(actor, str(fd, "customerId"), str(fd, "pfId"));
    return done(str(fd, "customerId"), "Stiftung entfernt.");
  });
}

export async function saveOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await saveTransferOrder(actor, str(fd, "customerId"), str(fd, "orderId") || null, {
      foundationId: str(fd, "foundationId"),
      orderDate: str(fd, "orderDate"),
      status: str(fd, "status"),
      orderAmount: str(fd, "orderAmount"),
      receivedOn: str(fd, "receivedOn"),
      receivedAmount: str(fd, "receivedAmount"),
    });
    return done(str(fd, "customerId"), "Überweisungsauftrag gespeichert.");
  });
}

export async function saveTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await saveTransaction(actor, str(fd, "customerId"), str(fd, "txId") || null, {
      foundationId: str(fd, "foundationId"),
      kind: str(fd, "kind") || "eingang",
      amount: str(fd, "amount"),
      orderDate: str(fd, "orderDate"),
      receivedOn: str(fd, "receivedOn"),
      remark: str(fd, "remark"),
      transferOrderId: str(fd, "transferOrderId"),
    });
    return done(str(fd, "customerId"), "Transaktion gespeichert.");
  });
}

export async function deleteTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(fd, async () => {
    const actor = await actorOrThrow("portfolio.edit");
    await deleteTransaction(actor, str(fd, "customerId"), str(fd, "txId"), str(fd, "reason"));
    return done(str(fd, "customerId"), "Transaktion storniert.");
  });
}
