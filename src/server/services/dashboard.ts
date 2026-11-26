import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { activityLog, applicationStatusHistory, applications, brokerFirms, customers, documents, portfolios, responseDocuments, transactions, transferOrders, users } from "../db/schema";
import { applicationScope, assertCan, customerScope, type Actor } from "../authz";

const n = (v: unknown) => Number(v ?? 0);

export async function dashboardData(actor: Actor) {
  assertCan(actor, "dashboard.view");
  const cs = customerScope(actor);
  const as = applicationScope(actor);
  const base = {
    customers: n((await db.select({ c: count() }).from(customers).where(cs))[0].c),
    customersNew30: n((await db.select({ c: count() }).from(customers).where(and(cs, gte(customers.createdAt, sql`now() - interval '30 days'`))))[0].c),
    submitted: n((await db.select({ c: count() }).from(applications).innerJoin(customers, eq(customers.id, applications.customerId)).where(and(as, eq(applications.phase, "eingereicht"))))[0].c),
    inCapture: n((await db.select({ c: count() }).from(applications).innerJoin(customers, eq(customers.id, applications.customerId)).where(and(as, eq(applications.phase, "entwurf"))))[0].c),
    waiting: n((await db.select({ c: count() }).from(applications).innerJoin(customers, eq(customers.id, applications.customerId)).where(and(as, eq(applications.outcomeStatus, "warten_auf_antwort"))))[0].c),
    opened: n((await db.select({ c: count() }).from(applications).innerJoin(customers, eq(customers.id, applications.customerId)).where(and(as, eq(applications.outcomeStatus, "konto_eroeffnet"))))[0].c),
    openCases: n(
      (await db.select({ c: count() }).from(customers).where(and(cs, inArray(customers.intakeStatus, ["neu_erfasst", "unterlagen_unvollstaendig", "bereit_zur_antragstellung"]))))[0].c,
    ),
  };

  const recentActivity = await db
    .select({ id: activityLog.id, summary: activityLog.summary, createdAt: activityLog.createdAt, actorLabel: activityLog.actorLabel, customerId: activityLog.customerId, first: customers.firstName, last: customers.lastName })
    .from(activityLog)
    .innerJoin(customers, eq(customers.id, activityLog.customerId))
    .where(and(cs, ne(activityLog.action, "document.view")))
    .orderBy(desc(activityLog.createdAt))
    .limit(10);

  const recentStatus = await db
    .select({ id: applicationStatusHistory.id, appId: applications.id, kind: applicationStatusHistory.kind, newStatus: applicationStatusHistory.newStatus, changedAt: applicationStatusHistory.changedAt, first: customers.firstName, last: customers.lastName })
    .from(applicationStatusHistory)
    .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
    .innerJoin(customers, eq(customers.id, applications.customerId))
    .where(as)
    .orderBy(desc(applicationStatusHistory.changedAt))
    .limit(10);

  let money: { received: number; transferred: number } | null = null;
  let byBroker: { name: string | null; customers: number; submitted: number }[] = [];
  let byAdvisor: { name: string; broker: string | null; customers: number; submitted: number }[] = [];

  if (actor.role === "pensora_gl") {
    const [r] = await db.select({ s: sql<string>`coalesce(sum(${transactions.amount}),0)` }).from(transactions).innerJoin(portfolios, eq(portfolios.id, transactions.portfolioId)).where(and(isNull(transactions.deletedAt), isNull(portfolios.removedAt), sql`(${transactions.kind} = 'korrektur' or ${transactions.receivedOn} is not null)`));
    const [t] = await db.select({ s: sql<string>`coalesce(sum(coalesce(${transferOrders.orderAmount}, 0)),0)` }).from(transferOrders).where(ne(transferOrders.status, "storniert"));
    money = { received: n(r.s), transferred: n(t.s) };
    byBroker = (
      await db.execute<{ name: string | null; customers: number; submitted: number }>(sql`
        select b.name, count(distinct c.id)::int as customers, count(distinct a.id) filter (where a.phase = 'eingereicht')::int as submitted
        from ${customers} c left join ${brokerFirms} b on b.id = c.broker_firm_id left join ${applications} a on a.customer_id = c.id
        where c.deleted_at is null group by b.name order by customers desc limit 10`)
    ).map((r) => ({ ...r }));
  }
  if (actor.role === "pensora_gl" || actor.role === "broker_gl") {
    const firm = actor.role === "broker_gl" ? sql`and u.broker_firm_id = ${actor.brokerFirmId}` : sql``;
    byAdvisor = (
      await db.execute<{ name: string; broker: string | null; customers: number; submitted: number }>(sql`
        select u.first_name || ' ' || u.last_name as name, b.name as broker, count(distinct c.id)::int as customers,
               count(distinct a.id) filter (where a.phase = 'eingereicht')::int as submitted
        from ${users} u left join ${brokerFirms} b on b.id = u.broker_firm_id
        left join ${customers} c on c.advisor_id = u.id and c.deleted_at is null
        left join ${applications} a on a.customer_id = c.id
        where u.deleted_at is null and u.role in ('broker_advisor','pensora_advisor','broker_gl') ${firm}
        group by u.id, u.first_name, u.last_name, b.name order by customers desc limit 15`)
    ).map((r) => ({ ...r }));
  }

  let backoffice: { newIn: number; inReview: number; ready: number; transmitted: number; responses30: number } | null = null;
  if (actor.permissions.has("review.access")) {
    const q = async (st: string[]) => n((await db.select({ c: count() }).from(applications).where(inArray(applications.reviewStatus, st as never)))[0].c);
    backoffice = {
      newIn: await q(["neu_eingegangen"]),
      inReview: await q(["in_pruefung", "unterlagen_unvollstaendig", "rueckfrage_erforderlich"]),
      ready: await q(["bereit_zur_uebermittlung"]),
      transmitted: await q(["uebermittelt"]),
      responses30: n((await db.select({ c: count() }).from(responseDocuments).where(gte(responseDocuments.createdAt, sql`now() - interval '30 days'`)))[0].c),
    };
  }
  const recentResponses = actor.permissions.has("review.access")
    ? await db
        .select({ id: responseDocuments.id, appId: responseDocuments.applicationId, receivedOn: responseDocuments.receivedOn, first: customers.firstName, last: customers.lastName })
        .from(responseDocuments)
        .innerJoin(applications, eq(applications.id, responseDocuments.applicationId))
        .innerJoin(customers, eq(customers.id, applications.customerId))
        .orderBy(desc(responseDocuments.createdAt))
        .limit(5)
    : [];
  const advisorCount =
    actor.role === "broker_gl" && actor.brokerFirmId
      ? n((await db.select({ c: count() }).from(users).where(and(eq(users.brokerFirmId, actor.brokerFirmId), isNull(users.deletedAt), eq(users.role, "broker_advisor"))))[0].c)
      : null;
  const docsToReview = actor.permissions.has("review.access")
    ? n((await db.select({ c: count() }).from(documents).innerJoin(applications, eq(applications.id, documents.applicationId)).where(and(eq(applications.reviewStatus, "neu_eingegangen"), isNull(documents.supersededAt), isNotNull(documents.applicationId))))[0].c)
    : 0;
  return { ...base, recentActivity, recentStatus, money, byBroker, byAdvisor, backoffice, recentResponses, advisorCount, docsToReview };
}
