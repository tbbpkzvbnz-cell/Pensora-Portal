import "server-only";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { applications, brokerFirms, customers, foundations, portfolioFoundations, portfolios, transactions, transferOrders, users } from "../db/schema";
import { assertCan, customerScope, NotFoundError, type Actor } from "../authz";
import { diff, logActivity } from "../audit";
import { getCustomer } from "./customers";
import { ValidationError, zodFieldErrors } from "./users";

/** Received money: incoming transactions with a receipt date, plus corrections. */
const receivedFilter = sql`${transactions.deletedAt} is null and (${transactions.kind} = 'korrektur' or ${transactions.receivedOn} is not null)`;

const money = z
  .string()
  .trim()
  .transform((v) => v.replace(/['’\s]/g, "").replace(/^CHF/i, "").replace(",", "."))
  .refine((v) => /^-?\d{1,12}(\.\d{1,2})?$/.test(v), "Ungültiger Betrag (z.B. 35000.00)");
const optDate = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum")]).transform((v) => v || null);
const uuid = z.string().uuid("Bitte auswählen");

/* ----------------------------- reads ----------------------------- */

async function portfolioFor(customerId: string) {
  const [p] = await db.select().from(portfolios).where(eq(portfolios.customerId, customerId));
  return p ?? null;
}

async function activePortfolioOrThrow(actor: Actor, customerId: string) {
  await getCustomer(actor, customerId);
  const p = await portfolioFor(customerId);
  if (!p || p.removedAt) throw new NotFoundError("Kunde ist nicht im Portfolio.");
  return p;
}

export async function getPortfolioSummary(actor: Actor, customerId: string) {
  assertCan(actor, "portfolio.view");
  await getCustomer(actor, customerId);
  const p = await portfolioFor(customerId);
  if (!p || p.removedAt) return { inPortfolio: false as const };
  const [t] = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)`, last: sql<string | null>`max(${transactions.receivedOn})` })
    .from(transactions)
    .where(and(eq(transactions.portfolioId, p.id), receivedFilter));
  const [{ n }] = await db.select({ n: count() }).from(portfolioFoundations).where(eq(portfolioFoundations.portfolioId, p.id));
  return { inPortfolio: true as const, total: t.total, lastReceivedOn: t.last, foundationCount: n };
}

export type PortfolioFilter = { q?: string; brokerFirmId?: string; advisorId?: string; sort?: string; dir?: string; page?: number; pageSize?: number };

export async function listPortfolio(actor: Actor, f: PortfolioFilter) {
  assertCan(actor, "portfolio.view");
  const conds: SQL[] = [customerScope(actor), isNull(portfolios.removedAt)];
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(or(ilike(customers.firstName, like), ilike(customers.lastName, like), sql`(${customers.firstName} || ' ' || ${customers.lastName}) ilike ${like}`, sql`(${customers.lastName} || ' ' || ${customers.firstName}) ilike ${like}`)!);
  }
  if (f.brokerFirmId === "pensora") conds.push(isNull(customers.brokerFirmId));
  else if (f.brokerFirmId) conds.push(eq(customers.brokerFirmId, f.brokerFirmId));
  if (f.advisorId) conds.push(eq(customers.advisorId, f.advisorId));

  const totals = db.$with("tot").as(
    db
      .select({
        portfolioId: transactions.portfolioId,
        total: sql<string>`sum(${transactions.amount})`.as("total"),
        last: sql<string | null>`max(${transactions.receivedOn})`.as("last"),
      })
      .from(transactions)
      .where(receivedFilter)
      .groupBy(transactions.portfolioId),
  );
  const byFoundation = db.$with("byf").as(
    db
      .select({
        portfolioId: sql<string>`x.portfolio_id`.as("bf_portfolio_id"),
        items: sql<{ name: string; amount: string }[]>`json_agg(json_build_object('name', x.name, 'amount', x.amount) order by x.name)`.as("items"),
      })
      .from(
        sql`(select pf.portfolio_id, f.name, coalesce((select sum(t.amount) from ${transactions} t where t.portfolio_id = pf.portfolio_id and t.foundation_id = pf.foundation_id and t.deleted_at is null and (t.kind = 'korrektur' or t.received_on is not null)), 0) as amount
             from ${portfolioFoundations} pf join ${foundations} f on f.id = pf.foundation_id) x`,
      )
      .groupBy(sql`x.portfolio_id`),
  );
  const sortMap: Record<string, SQL> = {
    name: sql`${customers.lastName} || ' ' || ${customers.firstName}`,
    betrag: sql`coalesce(${totals.total}, 0)`,
    eingang: sql`${totals.last}`,
  };
  const sortExpr = sortMap[f.sort ?? ""] ?? sortMap.betrag;
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 10), 5000);
  const page = Math.max(f.page ?? 1, 1);
  const where = and(...conds);
  const [rows, [{ total }], [{ sum }]] = await Promise.all([
    db
      .with(totals, byFoundation)
      .select({
        customerId: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        brokerName: brokerFirms.name,
        advisorName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        total: sql<string>`coalesce(${totals.total}, 0)`,
        lastReceivedOn: totals.last,
        foundations: byFoundation.items,
      })
      .from(portfolios)
      .innerJoin(customers, eq(customers.id, portfolios.customerId))
      .innerJoin(users, eq(users.id, customers.advisorId))
      .leftJoin(brokerFirms, eq(brokerFirms.id, customers.brokerFirmId))
      .leftJoin(totals, eq(totals.portfolioId, portfolios.id))
      .leftJoin(byFoundation, eq(byFoundation.portfolioId, portfolios.id))
      .where(where)
      .orderBy(f.dir === "asc" ? sql`${sortExpr} asc nulls last` : sql`${sortExpr} desc nulls last`, asc(customers.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(portfolios).innerJoin(customers, eq(customers.id, portfolios.customerId)).where(where),
    db
      .select({ sum: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .innerJoin(portfolios, eq(portfolios.id, transactions.portfolioId))
      .innerJoin(customers, eq(customers.id, portfolios.customerId))
      .where(and(where, receivedFilter)),
  ]);
  return { rows, total, page, pageSize, sum };
}

export async function getPortfolio(actor: Actor, customerId: string) {
  assertCan(actor, "portfolio.view");
  const cust = await getCustomer(actor, customerId);
  const p = await portfolioFor(customerId);
  const [{ accountOpened }] = await db
    .select({ accountOpened: sql<boolean>`bool_or(${applications.outcomeStatus} = 'konto_eroeffnet')` })
    .from(applications)
    .where(eq(applications.customerId, customerId));
  if (!p || p.removedAt) return { cust, portfolio: null, accountOpened: !!accountOpened } as const;
  const [pfs, orders, txs] = await Promise.all([
    db
      .select({ pf: portfolioFoundations, name: foundations.name, address: foundations.address })
      .from(portfolioFoundations)
      .innerJoin(foundations, eq(foundations.id, portfolioFoundations.foundationId))
      .where(eq(portfolioFoundations.portfolioId, p.id))
      .orderBy(asc(foundations.name)),
    db
      .select({ o: transferOrders, name: foundations.name })
      .from(transferOrders)
      .innerJoin(foundations, eq(foundations.id, transferOrders.foundationId))
      .where(eq(transferOrders.portfolioId, p.id))
      .orderBy(desc(transferOrders.orderDate), desc(transferOrders.createdAt)),
    db
      .select({ t: transactions, name: foundations.name, by: sql<string>`(select u.first_name || ' ' || u.last_name from ${users} u where u.id = ${transactions.createdBy})` })
      .from(transactions)
      .innerJoin(foundations, eq(foundations.id, transactions.foundationId))
      .where(and(eq(transactions.portfolioId, p.id), isNull(transactions.deletedAt)))
      .orderBy(sql`coalesce(${transactions.receivedOn}, ${transactions.orderDate}, ${transactions.createdAt}::date) desc`, desc(transactions.createdAt)),
  ]);
  const received = (t: (typeof txs)[number]["t"]) => t.kind === "korrektur" || !!t.receivedOn;
  const byFoundation = pfs.map((f) => ({
    foundationId: f.pf.foundationId,
    name: f.name,
    total: txs.filter((x) => x.t.foundationId === f.pf.foundationId && received(x.t)).reduce((s, x) => s + Number(x.t.amount), 0),
  }));
  const total = txs.filter((x) => received(x.t)).reduce((s, x) => s + Number(x.t.amount), 0);
  const lastReceivedOn = txs.map((x) => x.t.receivedOn).filter(Boolean).sort().at(-1) ?? null;
  return { cust, portfolio: p, accountOpened: !!accountOpened, foundations: pfs, orders, transactions: txs, byFoundation, total, lastReceivedOn } as const;
}

/* ----------------------------- foundations master ----------------------------- */

export async function listFoundations() {
  return db.select().from(foundations).orderBy(asc(foundations.name));
}

export async function createFoundation(actor: Actor, name: string, address: string) {
  assertCan(actor, "portfolio.edit");
  const n = name.trim();
  if (n.length < 2) throw new ValidationError("Bitte Namen der Stiftung eingeben.", { name: "Pflichtfeld" });
  const [dupe] = await db.select({ id: foundations.id }).from(foundations).where(sql`lower(${foundations.name}) = ${n.toLowerCase()}`);
  if (dupe) return dupe.id;
  const [f] = await db.insert(foundations).values({ name: n, address: address.trim() || null }).returning({ id: foundations.id });
  await logActivity({ actor, action: "foundation.create", entityType: "foundation", entityId: f.id, summary: `Stiftung ${n} erfasst` });
  return f.id;
}

export async function updateFoundation(actor: Actor, id: string, name: string, address: string) {
  assertCan(actor, "portfolio.edit");
  const [before] = await db.select().from(foundations).where(eq(foundations.id, id));
  if (!before) throw new NotFoundError();
  if (name.trim().length < 2) throw new ValidationError("Bitte Namen eingeben.");
  await db.update(foundations).set({ name: name.trim(), address: address.trim() || null }).where(eq(foundations.id, id));
  await logActivity({ actor, action: "foundation.update", entityType: "foundation", entityId: id, summary: `Stiftung ${before.name} bearbeitet`, changes: diff(before as Record<string, unknown>, { name: name.trim(), address: address.trim() || null }) });
}

/* ----------------------------- portfolio membership ----------------------------- */

export async function addToPortfolio(actor: Actor, customerId: string) {
  assertCan(actor, "portfolio.edit");
  const { customer } = await getCustomer(actor, customerId);
  const existing = await portfolioFor(customerId);
  if (existing && !existing.removedAt) throw new ValidationError("Der Kunde ist bereits im Portfolio.");
  if (existing) await db.update(portfolios).set({ removedAt: null, removedBy: null }).where(eq(portfolios.id, existing.id));
  else await db.insert(portfolios).values({ customerId, addedBy: actor.id });
  await logActivity({ actor, action: "portfolio.add", entityType: "portfolio", customerId, summary: `${customer.firstName} ${customer.lastName} ins Portfolio aufgenommen` });
}

export async function removeFromPortfolio(actor: Actor, customerId: string) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  const [{ n }] = await db.select({ n: count() }).from(transactions).where(and(eq(transactions.portfolioId, p.id), isNull(transactions.deletedAt)));
  const [{ o }] = await db.select({ o: count() }).from(transferOrders).where(eq(transferOrders.portfolioId, p.id));
  if (n + o > 0) {
    throw new ValidationError("Für diesen Kunden sind Transaktionen oder Überweisungsaufträge erfasst; diese unterliegen der Aufbewahrungspflicht. Entfernen ist daher nicht möglich.");
  }
  await db.update(portfolios).set({ removedAt: new Date(), removedBy: actor.id }).where(eq(portfolios.id, p.id));
  await logActivity({ actor, action: "portfolio.remove", entityType: "portfolio", entityId: p.id, customerId, summary: "Aus dem Portfolio entfernt" });
}

/* ----------------------------- foundations per customer ----------------------------- */

const pfInput = z.object({ foundationId: uuid, accountOpenedOn: optDate, remark: z.string().trim().max(1000).default("") });

export async function addPortfolioFoundation(actor: Actor, customerId: string, raw: unknown) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  const d = pfInput.safeParse(raw);
  if (!d.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(d.error));
  const [exists] = await db.select({ id: portfolioFoundations.id }).from(portfolioFoundations).where(and(eq(portfolioFoundations.portfolioId, p.id), eq(portfolioFoundations.foundationId, d.data.foundationId)));
  if (exists) throw new ValidationError("Diese Stiftung ist bereits hinterlegt.", { foundationId: "Bereits vorhanden" });
  const [f] = await db.select({ name: foundations.name }).from(foundations).where(eq(foundations.id, d.data.foundationId));
  if (!f) throw new ValidationError("Stiftung nicht gefunden.");
  await db.insert(portfolioFoundations).values({ portfolioId: p.id, foundationId: d.data.foundationId, accountOpenedOn: d.data.accountOpenedOn, remark: d.data.remark || null });
  await logActivity({ actor, action: "portfolio.foundation_add", entityType: "portfolio", entityId: p.id, customerId, summary: `Stiftung ${f.name} hinterlegt` });
}

export async function updatePortfolioFoundation(actor: Actor, customerId: string, pfId: string, raw: unknown) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  const d = pfInput.safeParse(raw);
  if (!d.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(d.error));
  const [before] = await db.select().from(portfolioFoundations).where(and(eq(portfolioFoundations.id, pfId), eq(portfolioFoundations.portfolioId, p.id)));
  if (!before) throw new NotFoundError();
  if (d.data.foundationId !== before.foundationId) {
    const [{ n }] = await db.select({ n: count() }).from(transactions).where(and(eq(transactions.portfolioId, p.id), eq(transactions.foundationId, before.foundationId), isNull(transactions.deletedAt)));
    if (n > 0) throw new ValidationError("Die Stiftung hat bereits Transaktionen und kann nicht ausgetauscht werden.");
  }
  const next = { foundationId: d.data.foundationId, accountOpenedOn: d.data.accountOpenedOn, remark: d.data.remark || null };
  await db.update(portfolioFoundations).set({ ...next, updatedAt: new Date() }).where(eq(portfolioFoundations.id, pfId));
  await logActivity({ actor, action: "portfolio.foundation_update", entityType: "portfolio", entityId: p.id, customerId, summary: "Stiftungsangaben geändert", changes: diff(before as Record<string, unknown>, next) });
}

export async function removePortfolioFoundation(actor: Actor, customerId: string, pfId: string) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  const [pf] = await db.select({ pf: portfolioFoundations, name: foundations.name }).from(portfolioFoundations).innerJoin(foundations, eq(foundations.id, portfolioFoundations.foundationId)).where(and(eq(portfolioFoundations.id, pfId), eq(portfolioFoundations.portfolioId, p.id)));
  if (!pf) throw new NotFoundError();
  const [{ n }] = await db.select({ n: count() }).from(transactions).where(and(eq(transactions.portfolioId, p.id), eq(transactions.foundationId, pf.pf.foundationId), isNull(transactions.deletedAt)));
  const [{ o }] = await db.select({ o: count() }).from(transferOrders).where(and(eq(transferOrders.portfolioId, p.id), eq(transferOrders.foundationId, pf.pf.foundationId)));
  if (n + o > 0) throw new ValidationError("Für diese Stiftung bestehen Transaktionen oder Überweisungsaufträge. Entfernen nicht möglich.");
  await db.delete(portfolioFoundations).where(eq(portfolioFoundations.id, pfId));
  await logActivity({ actor, action: "portfolio.foundation_remove", entityType: "portfolio", entityId: p.id, customerId, summary: `Stiftung ${pf.name} entfernt` });
}

async function assertFoundationLinked(portfolioId: string, foundationId: string) {
  const [l] = await db.select({ id: portfolioFoundations.id }).from(portfolioFoundations).where(and(eq(portfolioFoundations.portfolioId, portfolioId), eq(portfolioFoundations.foundationId, foundationId)));
  if (!l) throw new ValidationError("Bitte zuerst die Stiftung beim Kunden hinterlegen.", { foundationId: "Nicht beim Kunden hinterlegt" });
}

/* ----------------------------- transfer orders ----------------------------- */

const orderInput = z.object({
  foundationId: uuid,
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pflichtfeld"),
  status: z.enum(["erteilt", "in_bearbeitung", "ausgefuehrt", "storniert"]),
  orderAmount: z.union([z.literal(""), money]).transform((v) => v || null),
  receivedOn: optDate,
  receivedAmount: z.union([z.literal(""), money]).transform((v) => v || null),
});

export async function saveTransferOrder(actor: Actor, customerId: string, orderId: string | null, raw: unknown) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  const d = orderInput.safeParse(raw);
  if (!d.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(d.error));
  await assertFoundationLinked(p.id, d.data.foundationId);
  if (orderId) {
    const [before] = await db.select().from(transferOrders).where(and(eq(transferOrders.id, orderId), eq(transferOrders.portfolioId, p.id)));
    if (!before) throw new NotFoundError();
    await db.update(transferOrders).set({ ...d.data, updatedAt: new Date() }).where(eq(transferOrders.id, orderId));
    await logActivity({ actor, action: "transfer_order.update", entityType: "transfer_order", entityId: orderId, customerId, summary: "Überweisungsauftrag geändert", changes: diff(before as Record<string, unknown>, d.data) });
  } else {
    const [o] = await db.insert(transferOrders).values({ ...d.data, portfolioId: p.id, createdBy: actor.id }).returning({ id: transferOrders.id });
    await logActivity({ actor, action: "transfer_order.create", entityType: "transfer_order", entityId: o.id, customerId, summary: `Überweisungsauftrag erfasst${d.data.orderAmount ? ` (CHF ${d.data.orderAmount})` : ""}` });
  }
}

/* ----------------------------- transactions ----------------------------- */

const txInput = z
  .object({
    foundationId: uuid,
    kind: z.enum(["eingang", "korrektur"]),
    amount: money,
    orderDate: optDate,
    receivedOn: optDate,
    remark: z.string().trim().max(1000).default(""),
    transferOrderId: z.union([z.literal(""), z.string().uuid()]).transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "korrektur" && v.remark.length < 5) ctx.addIssue({ code: "custom", path: ["remark"], message: "Für Korrekturen ist eine Begründung Pflicht" });
    if (v.kind === "eingang" && Number(v.amount) <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Betrag muss positiv sein (Korrekturen als Art „Korrektur“ erfassen)" });
  });

export async function saveTransaction(actor: Actor, customerId: string, txId: string | null, raw: unknown) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  const d = txInput.safeParse(raw);
  if (!d.success) throw new ValidationError("Bitte Eingaben prüfen.", zodFieldErrors(d.error));
  await assertFoundationLinked(p.id, d.data.foundationId);
  if (d.data.transferOrderId) {
    const [o] = await db.select({ id: transferOrders.id }).from(transferOrders).where(and(eq(transferOrders.id, d.data.transferOrderId), eq(transferOrders.portfolioId, p.id)));
    if (!o) throw new ValidationError("Ungültiger Überweisungsauftrag.");
  }
  const values = { ...d.data, remark: d.data.remark || null };
  if (txId) {
    const [before] = await db.select().from(transactions).where(and(eq(transactions.id, txId), eq(transactions.portfolioId, p.id), isNull(transactions.deletedAt)));
    if (!before) throw new NotFoundError();
    await db.update(transactions).set({ ...values, updatedAt: new Date() }).where(eq(transactions.id, txId));
    await logActivity({ actor, action: "transaction.update", entityType: "transaction", entityId: txId, customerId, summary: "Transaktion geändert", changes: diff(before as Record<string, unknown>, values) });
  } else {
    const [t] = await db.insert(transactions).values({ ...values, portfolioId: p.id, createdBy: actor.id }).returning({ id: transactions.id });
    await logActivity({ actor, action: "transaction.create", entityType: "transaction", entityId: t.id, customerId, summary: `${d.data.kind === "korrektur" ? "Korrektur" : "Transaktion"} erfasst: CHF ${d.data.amount}` });
  }
}

export async function deleteTransaction(actor: Actor, customerId: string, txId: string, reason: string) {
  assertCan(actor, "portfolio.edit");
  const p = await activePortfolioOrThrow(actor, customerId);
  if (reason.trim().length < 5) throw new ValidationError("Bitte Begründung angeben.");
  const [t] = await db.select().from(transactions).where(and(eq(transactions.id, txId), eq(transactions.portfolioId, p.id), isNull(transactions.deletedAt)));
  if (!t) throw new NotFoundError();
  await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, txId));
  await logActivity({ actor, action: "transaction.delete", entityType: "transaction", entityId: txId, customerId, summary: `Transaktion über CHF ${t.amount} storniert: ${reason.trim()}` });
}
